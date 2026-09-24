import { checkDeliveredStatus } from './delivery-status';

describe('checkDeliveredStatus', () => {
  it('detects a French "Livré" status regardless of accent/case', () => {
    expect(checkDeliveredStatus({ etat: 'Livré' }).delivered).toBe(true);
    expect(checkDeliveredStatus({ etat: 'LIVRE' }).delivered).toBe(true);
    expect(checkDeliveredStatus({ status: 'livrée avec succès' }).delivered).toBe(true);
  });

  it('detects an English "Delivered" status', () => {
    expect(checkDeliveredStatus({ status: 'Delivered' }).delivered).toBe(true);
    expect(checkDeliveredStatus({ status_message: 'Package delivered successfully' }).delivered).toBe(true);
  });

  it('finds a delivered keyword nested arbitrarily deep', () => {
    const raw = { result: { history: [{ event: 'En cours' }, { event: 'Colis livré au client' }] } };
    expect(checkDeliveredStatus(raw).delivered).toBe(true);
  });

  it('does NOT treat "en livraison" (in transit) as delivered', () => {
    expect(checkDeliveredStatus({ etat: 'En livraison' }).delivered).toBe(false);
    expect(checkDeliveredStatus({ etat: 'En cours de livraison' }).delivered).toBe(false);
  });

  it('does NOT treat other terminal statuses (returned/cancelled/failed) as delivered', () => {
    expect(checkDeliveredStatus({ etat: 'Retourné' }).delivered).toBe(false);
    expect(checkDeliveredStatus({ etat: 'Annulé' }).delivered).toBe(false);
    expect(checkDeliveredStatus({ etat: 'Refusé par le client' }).delivered).toBe(false);
    expect(checkDeliveredStatus({ etat: 'En attente' }).delivered).toBe(false);
  });

  it('is safe against null/undefined/primitive/malformed payloads', () => {
    expect(checkDeliveredStatus(null).delivered).toBe(false);
    expect(checkDeliveredStatus(undefined).delivered).toBe(false);
    expect(checkDeliveredStatus(42).delivered).toBe(false);
    expect(checkDeliveredStatus('just a plain string, no keyword').delivered).toBe(false);
    expect(checkDeliveredStatus('plain string says Livré').delivered).toBe(true);
  });

  it('picks a status-like field for rawText over an unrelated string when both exist', () => {
    const raw = { trackingNumber: '123456789', etat: 'Livré' };
    expect(checkDeliveredStatus(raw).rawText).toBe('Livré');
  });

  it('falls back to the matched keyword string when no status-like key is found', () => {
    const raw = { result: ['Colis livré'] };
    const check = checkDeliveredStatus(raw);
    expect(check.delivered).toBe(true);
    expect(check.rawText).toBe('Colis livré');
  });

  it('never crashes on a deeply nested or long payload (depth/length guards)', () => {
    let nested: unknown = 'Livré';
    for (let i = 0; i < 20; i++) nested = { child: nested };
    expect(() => checkDeliveredStatus(nested)).not.toThrow();

    const huge = { list: Array.from({ length: 500 }, (_, i) => `event ${i}`) };
    expect(() => checkDeliveredStatus(huge)).not.toThrow();
  });
});
