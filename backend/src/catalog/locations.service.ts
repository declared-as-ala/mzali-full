import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BOUTIQUE_CODE, DEPOT_CODE, Location, LocationDocument } from './location.schema';

@Injectable()
export class LocationsService {
  constructor(@InjectModel(Location.name) private readonly model: Model<Location>) {}

  async list(): Promise<LocationDocument[]> {
    return this.model.find().sort({ code: 1 });
  }

  async findByCode(code: string): Promise<LocationDocument | null> {
    return this.model.findOne({ code: code.toUpperCase() });
  }

  async requireByCode(code: string): Promise<LocationDocument> {
    const doc = await this.findByCode(code);
    if (!doc) throw new NotFoundException(`Location introuvable: ${code}`);
    return doc;
  }

  /** DEPOT — cached per-process; locations essentially never change at runtime. */
  private depotCode: string | null = null;
  async getDefaultOnlineLocationCode(): Promise<string> {
    if (this.depotCode) return this.depotCode;
    const doc = await this.model.findOne({ isDefaultOnlineLocation: true });
    this.depotCode = doc?.code ?? DEPOT_CODE;
    return this.depotCode;
  }

  private boutiqueCode: string | null = null;
  async getDefaultPosLocationCode(): Promise<string> {
    if (this.boutiqueCode) return this.boutiqueCode;
    const doc = await this.model.findOne({ isDefaultPosLocation: true });
    this.boutiqueCode = doc?.code ?? BOUTIQUE_CODE;
    return this.boutiqueCode;
  }

  async update(code: string, patch: Partial<Pick<Location, 'name' | 'address' | 'active' | 'allowNegativeStock'>>): Promise<LocationDocument> {
    const doc = await this.requireByCode(code);
    if (patch.name !== undefined) doc.name = patch.name;
    if (patch.address !== undefined) doc.address = patch.address;
    if (patch.active !== undefined) doc.active = patch.active;
    if (patch.allowNegativeStock !== undefined) doc.allowNegativeStock = patch.allowNegativeStock;
    await doc.save();
    return doc;
  }
}
