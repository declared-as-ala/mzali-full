import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import type { CardTemplateCode } from '@contracts';
import { clampPagination, paginate } from '@/common/pagination';
import { normalizePhone } from '@/common/phone';
import { randomCode, randomToken } from '@/common/secure-code';
import { CountersService } from '@/database/counters.service';
import { Customer } from '@/customers/customer.schema';
import { CustomersService } from '@/customers/customers.service';
import { SettingsService } from '@/settings/settings.service';
import { LoyaltyAccount, LoyaltyAccountDocument } from './loyalty-account.schema';
import { LoyaltyCardBatch, LoyaltyCardBatchDocument } from './loyalty-card-batch.schema';
import { LoyaltyCard, LoyaltyCardDocument } from './loyalty-card.schema';

const BATCH_SEQUENCE = 'loyalty-card-batch';
const MAX_BATCH_QUANTITY = 2000;
const MAX_NUMBER_GENERATION_ATTEMPTS = 5;

export type CardActorInput = { type: 'employee' | 'system'; id: string | null; name: string };

@Injectable()
export class LoyaltyCardsService {
  private virtualBatchId: string | null = null;

  constructor(
    @InjectModel(LoyaltyCard.name) private readonly cards: Model<LoyaltyCard>,
    @InjectModel(LoyaltyCardBatch.name) private readonly batches: Model<LoyaltyCardBatch>,
    @InjectModel(LoyaltyAccount.name) private readonly accounts: Model<LoyaltyAccount>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    private readonly customersService: CustomersService,
    private readonly counters: CountersService,
    private readonly settings: SettingsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ---- number/token generation ----------------------------------------

  private formatCardNumber(raw: string): string {
    return `MZC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`;
  }

  private generateCandidateNumbers(count: number): string[] {
    const set = new Set<string>();
    while (set.size < count) {
      set.add(this.formatCardNumber(randomCode(10)));
    }
    return [...set];
  }

  /** Batch-generates unique card numbers in O(1) DB round trips (typically
   *  one) instead of checking one-by-one — the 32^10 keyspace makes
   *  collisions vanishingly unlikely even at MAX_BATCH_QUANTITY, so the
   *  retry loop below is defensive, not the common path. */
  private async generateUniqueCardNumbers(count: number): Promise<string[]> {
    let candidates = this.generateCandidateNumbers(count);
    for (let attempt = 0; attempt < MAX_NUMBER_GENERATION_ATTEMPTS; attempt++) {
      const existing = await this.cards.find({ cardNumber: { $in: candidates } }).select({ cardNumber: 1 });
      if (!existing.length) return candidates;
      const existingSet = new Set(existing.map((e) => e.cardNumber));
      const replacements = this.generateCandidateNumbers(existingSet.size);
      candidates = candidates.filter((c) => !existingSet.has(c)).concat(replacements);
    }
    throw new Error('Impossible de générer des numéros de carte uniques après plusieurs tentatives');
  }

  private async getOrCreateVirtualBatch(session?: ClientSession): Promise<LoyaltyCardBatchDocument> {
    if (this.virtualBatchId) {
      const cached = await this.batches.findById(this.virtualBatchId).session(session ?? null);
      if (cached) return cached;
    }
    const existing = await this.batches.findOne({ virtual: true }).session(session ?? null);
    if (existing) {
      this.virtualBatchId = existing.id;
      return existing;
    }
    const batchNumber = await this.counters.next(BATCH_SEQUENCE, session);
    const [doc] = await this.batches.create(
      [
        {
          batchNumber,
          name: 'Cartes virtuelles (création rapide POS)',
          quantity: 0,
          templateCode: 'STANDARD',
          templateVersion: 1,
          generatedBy: { type: 'system', id: null, name: 'Système' },
          status: 'PRINTED',
          virtual: true,
        },
      ],
      { session },
    );
    this.virtualBatchId = doc.id;
    return doc;
  }

  /**
   * Creates a brand-new account together with its own virtual (never-
   * printed) card in one call — the exact behavior
   * `LoyaltyService.createAccount()` had before this card system existed
   * (opt-in POS quick-create), now backed by a real `loyalty_cards` row so
   * every account, quick-created or batch-assigned, shares one lifecycle
   * and one numbering scheme.
   */
  async issueVirtualCardAndAccount(
    customerId: string,
    actor: CardActorInput,
  ): Promise<{ account: LoyaltyAccountDocument; card: LoyaltyCardDocument }> {
    const session = await this.connection.startSession();
    let result!: { account: LoyaltyAccountDocument; card: LoyaltyCardDocument };
    try {
      await session.withTransaction(async () => {
        const batch = await this.getOrCreateVirtualBatch(session);
        const [cardNumber] = await this.generateUniqueCardNumbers(1);
        const qrToken = randomToken();
        const now = new Date();

        const [account] = await this.accounts.create(
          [
            {
              customerId,
              cardNumber,
              qrCodeValue: qrToken,
              barcodeValue: cardNumber,
              pointsBalance: 0,
              lifetimePointsEarned: 0,
              lifetimePointsRedeemed: 0,
              status: 'ACTIVE',
              joinedAt: now,
              lastActivityAt: null,
            },
          ],
          { session },
        );
        const [card] = await this.cards.create(
          [
            {
              cardNumber,
              qrToken,
              barcodeValue: cardNumber,
              batchId: batch.id,
              templateCode: 'STANDARD',
              status: 'ACTIVE',
              accountId: account.id,
              customerId,
              assignedAt: now,
              assignedBy: actor,
              history: [
                { event: 'GENERATED', at: now, by: actor, note: null },
                { event: 'ASSIGNED', at: now, by: actor, note: 'Création rapide POS' },
              ],
            },
          ],
          { session },
        );
        result = { account, card };
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  // ---- batches ----------------------------------------------------

  async createBatch(
    dto: { name: string; quantity: number; templateCode: CardTemplateCode; notes?: string },
    actor: CardActorInput,
    idempotencyKey?: string,
  ): Promise<LoyaltyCardBatchDocument> {
    if (idempotencyKey) {
      const existing = await this.batches.findOne({ idempotencyKey });
      if (existing) return existing;
    }
    if (dto.quantity < 1 || dto.quantity > MAX_BATCH_QUANTITY) {
      throw new BadRequestException(`Quantité invalide (1 à ${MAX_BATCH_QUANTITY})`);
    }

    const batchNumber = await this.counters.next(BATCH_SEQUENCE);
    const cardNumbers = await this.generateUniqueCardNumbers(dto.quantity);
    const now = new Date();

    const session = await this.connection.startSession();
    let batch!: LoyaltyCardBatchDocument;
    try {
      await session.withTransaction(async () => {
        const [doc] = await this.batches.create(
          [
            {
              batchNumber,
              name: dto.name,
              quantity: dto.quantity,
              templateCode: dto.templateCode,
              templateVersion: 1,
              generatedBy: actor,
              status: 'GENERATED',
              notes: dto.notes ?? null,
              virtual: false,
              idempotencyKey: idempotencyKey ?? undefined,
            },
          ],
          { session },
        );
        batch = doc;
        const cardDocs = cardNumbers.map((cardNumber) => ({
          cardNumber,
          qrToken: randomToken(),
          barcodeValue: cardNumber,
          batchId: doc.id,
          templateCode: dto.templateCode,
          status: 'UNASSIGNED' as const,
          history: [{ event: 'GENERATED' as const, at: now, by: actor, note: null }],
        }));
        await this.cards.insertMany(cardDocs, { session, ordered: true });
      });
    } finally {
      await session.endSession();
    }
    return batch;
  }

  async listBatches(): Promise<Array<{ batch: LoyaltyCardBatchDocument; counts: Record<string, number> }>> {
    const batchDocs = await this.batches.find({ virtual: false }).sort({ batchNumber: -1 });
    if (!batchDocs.length) return [];
    const countsAgg = await this.cards.aggregate<{ _id: { batchId: string; status: string }; count: number }>([
      { $match: { batchId: { $in: batchDocs.map((b) => b.id) } } },
      { $group: { _id: { batchId: '$batchId', status: '$status' }, count: { $sum: 1 } } },
    ]);
    const countsByBatch = new Map<string, Record<string, number>>();
    for (const row of countsAgg) {
      const existing = countsByBatch.get(row._id.batchId) ?? {};
      existing[row._id.status] = row.count;
      countsByBatch.set(row._id.batchId, existing);
    }
    return batchDocs.map((batch) => ({ batch, counts: countsByBatch.get(batch.id) ?? {} }));
  }

  async getBatchById(id: string): Promise<LoyaltyCardBatchDocument | null> {
    return this.batches.findById(id).catch(() => null);
  }

  async batchCounts(batchId: string): Promise<Record<string, number>> {
    const agg = await this.cards.aggregate<{ _id: string; count: number }>([
      { $match: { batchId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(agg.map((r) => [r._id, r.count]));
  }

  async markBatchExported(id: string): Promise<LoyaltyCardBatchDocument> {
    const batch = await this.batches.findById(id);
    if (!batch) throw new NotFoundException('Lot introuvable');
    batch.exportedAt = new Date();
    if (batch.status === 'GENERATED') batch.status = 'EXPORTED';
    await batch.save();
    return batch;
  }

  async markBatchPrinted(id: string): Promise<LoyaltyCardBatchDocument> {
    const batch = await this.batches.findById(id);
    if (!batch) throw new NotFoundException('Lot introuvable');
    batch.printedAt = new Date();
    batch.status = 'PRINTED';
    await batch.save();
    return batch;
  }

  async revokeUnassignedInBatch(batchId: string, actor: CardActorInput, reason: string): Promise<number> {
    const now = new Date();
    const result = await this.cards.updateMany(
      { batchId, status: 'UNASSIGNED' },
      {
        $set: { status: 'REVOKED', revokedAt: now, revokedReason: reason },
        $push: { history: { event: 'REVOKED', at: now, by: actor, note: reason } },
      },
    );
    return result.modifiedCount;
  }

  async cardsInBatch(batchId: string): Promise<LoyaltyCardDocument[]> {
    return this.cards.find({ batchId }).sort({ cardNumber: 1 });
  }

  // ---- lookup ----------------------------------------------------

  async getById(id: string): Promise<LoyaltyCardDocument | null> {
    return this.cards.findById(id).catch(() => null);
  }

  async getByCardNumber(cardNumber: string): Promise<LoyaltyCardDocument | null> {
    return this.cards.findOne({ cardNumber: cardNumber.trim().toUpperCase() });
  }

  async getByQrToken(qrToken: string): Promise<LoyaltyCardDocument | null> {
    return this.cards.findOne({ qrToken });
  }

  /** Unified identify-by-anything lookup used by the POS assign/checkout
   *  flow — card number, QR token, or barcode value (same as card number
   *  today) all resolve here. */
  async lookup(identifier: { cardNumber?: string; qrToken?: string }): Promise<LoyaltyCardDocument | null> {
    if (identifier.qrToken) return this.getByQrToken(identifier.qrToken);
    if (identifier.cardNumber) return this.getByCardNumber(identifier.cardNumber);
    return null;
  }

  async listAdmin(filters: { search?: string; batchId?: string; status?: string }, page?: number, perPage?: number) {
    const { page: p, perPage: pp, skip } = clampPagination(page, perPage, 50);
    const filter: Record<string, unknown> = {};
    if (filters.batchId) filter.batchId = filters.batchId;
    if (filters.status) filter.status = filters.status;
    if (filters.search) {
      const normalized = normalizePhone(filters.search);
      const matchingCustomers = await this.customers
        .find({ phone: { $regex: normalized || filters.search, $options: 'i' } })
        .select({ _id: 1 });
      filter.$or = [
        { cardNumber: { $regex: filters.search, $options: 'i' } },
        { customerId: { $in: matchingCustomers.map((c) => c.id) } },
      ];
    }
    const [docs, total] = await Promise.all([
      this.cards.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pp),
      this.cards.countDocuments(filter),
    ]);
    return paginate(await this.enrich(docs), total, p, pp);
  }

  async enrich(docs: LoyaltyCardDocument[]) {
    const customerIds = [...new Set(docs.map((d) => d.customerId).filter((id): id is string => Boolean(id)))];
    const customerDocs = customerIds.length ? await this.customers.find({ _id: { $in: customerIds } }) : [];
    const customerById = new Map(customerDocs.map((c) => [c.id, c]));
    const batchIds = [...new Set(docs.map((d) => d.batchId).filter((id): id is string => Boolean(id)))];
    const batchDocs = batchIds.length ? await this.batches.find({ _id: { $in: batchIds } }).select({ name: 1 }) : [];
    const batchById = new Map(batchDocs.map((b) => [b.id, b]));
    return docs.map((doc) => ({
      doc,
      customer: doc.customerId ? customerById.get(doc.customerId) : null,
      batchName: doc.batchId ? (batchById.get(doc.batchId)?.name ?? null) : null,
    }));
  }

  // ---- assignment ----------------------------------------------------

  /**
   * Attaches an UNASSIGNED physical card to a customer, creating the
   * account if none exists. Fully transactional: the same card can never
   * end up assigned to two customers, and (unless
   * settings.loyalty.allowMultipleCardsPerCustomer) a customer never ends
   * up with two ACTIVE cards.
   */
  async assign(
    identifier: { cardNumber?: string; qrToken?: string },
    target: { customerId?: string; phone?: string; firstName?: string; lastName?: string },
    actor: CardActorInput,
  ): Promise<{ card: LoyaltyCardDocument; account: LoyaltyAccountDocument }> {
    if (!identifier.cardNumber && !identifier.qrToken) throw new BadRequestException('Carte requise');
    if (!target.customerId && !target.phone) throw new BadRequestException('Client requis');

    const allowMultiple = (await this.settings.getLoyaltySettings()).allowMultipleCardsPerCustomer;
    const session = await this.connection.startSession();
    let result!: { card: LoyaltyCardDocument; account: LoyaltyAccountDocument };
    try {
      await session.withTransaction(async () => {
        const card = identifier.qrToken
          ? await this.cards.findOne({ qrToken: identifier.qrToken }).session(session)
          : await this.cards.findOne({ cardNumber: identifier.cardNumber?.trim().toUpperCase() }).session(session);
        if (!card) throw new NotFoundException('Carte introuvable');
        if (card.status === 'REVOKED') throw new BadRequestException('Cette carte a été révoquée');
        if (card.status !== 'UNASSIGNED') throw new BadRequestException('Cette carte est déjà attribuée ou indisponible');

        let customerId = target.customerId ?? null;
        if (!customerId) {
          const customer = await this.customersService.findOrCreateByPhone(
            target.phone!,
            { firstName: target.firstName, lastName: target.lastName },
            session,
          );
          customerId = customer.id;
        }

        let account = await this.accounts.findOne({ customerId }).session(session);
        if (account && !allowMultiple) {
          const existingActive = await this.cards.findOne({ accountId: account.id, status: 'ACTIVE' }).session(session);
          if (existingActive) {
            throw new BadRequestException(
              `Ce client a déjà une carte active (${existingActive.cardNumber}) — révoquez-la d'abord ou activez la carte multiple dans les paramètres`,
            );
          }
        }

        const now = new Date();
        if (!account) {
          const [doc] = await this.accounts.create(
            [
              {
                customerId,
                cardNumber: card.cardNumber,
                qrCodeValue: card.qrToken,
                barcodeValue: card.barcodeValue,
                pointsBalance: 0,
                lifetimePointsEarned: 0,
                lifetimePointsRedeemed: 0,
                status: 'ACTIVE',
                joinedAt: now,
                lastActivityAt: null,
              },
            ],
            { session },
          );
          account = doc;
        } else {
          account.cardNumber = card.cardNumber;
          account.qrCodeValue = card.qrToken;
          account.barcodeValue = card.barcodeValue;
          await account.save({ session });
        }

        card.status = 'ACTIVE';
        card.accountId = account.id;
        card.customerId = customerId;
        card.assignedAt = now;
        card.assignedBy = actor;
        card.history.push({ event: 'ASSIGNED', at: now, by: actor, note: null } as LoyaltyCard['history'][number]);
        await card.save({ session });

        result = { card, account };
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async suspend(id: string, actor: CardActorInput, reason?: string): Promise<LoyaltyCardDocument> {
    const card = await this.mustGet(id);
    if (card.status !== 'ACTIVE') throw new BadRequestException('Seule une carte active peut être suspendue');
    card.status = 'SUSPENDED';
    card.history.push({ event: 'SUSPENDED', at: new Date(), by: actor, note: reason ?? null } as LoyaltyCard['history'][number]);
    await card.save();
    return card;
  }

  async reactivate(id: string, actor: CardActorInput): Promise<LoyaltyCardDocument> {
    const card = await this.mustGet(id);
    if (card.status !== 'SUSPENDED') throw new BadRequestException('Seule une carte suspendue peut être réactivée');
    card.status = 'ACTIVE';
    card.history.push({ event: 'REACTIVATED', at: new Date(), by: actor, note: null } as LoyaltyCard['history'][number]);
    await card.save();
    return card;
  }

  async revoke(id: string, actor: CardActorInput, reason: string): Promise<LoyaltyCardDocument> {
    const card = await this.mustGet(id);
    if (card.status === 'REVOKED') return card;
    card.status = 'REVOKED';
    card.revokedAt = new Date();
    card.revokedReason = reason;
    card.history.push({ event: 'REVOKED', at: new Date(), by: actor, note: reason } as LoyaltyCard['history'][number]);
    await card.save();
    return card;
  }

  async markLost(id: string, actor: CardActorInput, reason?: string): Promise<LoyaltyCardDocument> {
    const card = await this.mustGet(id);
    if (card.status !== 'ACTIVE' && card.status !== 'SUSPENDED') {
      throw new BadRequestException('Seule une carte active ou suspendue peut être déclarée perdue');
    }
    card.status = 'LOST';
    card.history.push({ event: 'MARKED_LOST', at: new Date(), by: actor, note: reason ?? null } as LoyaltyCard['history'][number]);
    await card.save();
    return card;
  }

  /**
   * Replaces a lost/damaged card with a fresh UNASSIGNED one, keeping the
   * same account and points balance untouched — points live on
   * `LoyaltyAccount`, never on the physical card.
   */
  async replace(
    oldCardId: string,
    newIdentifier: { cardNumber?: string; qrToken?: string },
    actor: CardActorInput,
    reason: string,
  ): Promise<{ oldCard: LoyaltyCardDocument; newCard: LoyaltyCardDocument; account: LoyaltyAccountDocument }> {
    const session = await this.connection.startSession();
    let result!: { oldCard: LoyaltyCardDocument; newCard: LoyaltyCardDocument; account: LoyaltyAccountDocument };
    try {
      await session.withTransaction(async () => {
        const oldCard = await this.cards.findById(oldCardId).session(session);
        if (!oldCard) throw new NotFoundException('Ancienne carte introuvable');
        if (!oldCard.accountId) throw new BadRequestException("Cette carte n'est attribuée à aucun compte");
        if (!['ACTIVE', 'SUSPENDED', 'LOST'].includes(oldCard.status)) {
          throw new BadRequestException('Cette carte ne peut pas être remplacée dans son état actuel');
        }

        const newCard = newIdentifier.qrToken
          ? await this.cards.findOne({ qrToken: newIdentifier.qrToken }).session(session)
          : await this.cards.findOne({ cardNumber: newIdentifier.cardNumber?.trim().toUpperCase() }).session(session);
        if (!newCard) throw new NotFoundException('Nouvelle carte introuvable');
        if (newCard.status !== 'UNASSIGNED') throw new BadRequestException("La nouvelle carte n'est pas disponible");

        const account = await this.accounts.findById(oldCard.accountId).session(session);
        if (!account) throw new NotFoundException('Compte de fidélité introuvable');

        const now = new Date();
        oldCard.status = 'REPLACED';
        oldCard.replacedByCardId = newCard.id;
        oldCard.history.push({ event: 'REPLACED', at: now, by: actor, note: reason } as LoyaltyCard['history'][number]);
        await oldCard.save({ session });

        newCard.status = 'ACTIVE';
        newCard.accountId = account.id;
        newCard.customerId = account.customerId;
        newCard.assignedAt = now;
        newCard.assignedBy = actor;
        newCard.replacesCardId = oldCard.id;
        newCard.history.push({ event: 'ASSIGNED', at: now, by: actor, note: `Remplace ${oldCard.cardNumber} — ${reason}` } as LoyaltyCard['history'][number]);
        await newCard.save({ session });

        account.cardNumber = newCard.cardNumber;
        account.qrCodeValue = newCard.qrToken;
        account.barcodeValue = newCard.barcodeValue;
        await account.save({ session });

        result = { oldCard, newCard, account };
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  private async mustGet(id: string): Promise<LoyaltyCardDocument> {
    const card = await this.cards.findById(id).catch(() => null);
    if (!card) throw new NotFoundException('Carte introuvable');
    return card;
  }
}
