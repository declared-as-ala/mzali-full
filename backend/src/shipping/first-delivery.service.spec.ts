import { ConfigService } from '@nestjs/config';
import { FirstDeliveryService } from './first-delivery.service';

const localities = [
  { locality_id: 10, locality_name: 'Centre', delegation_name: 'Sousse Medina', governorate_name: 'Sousse' },
  { locality_id: 11, locality_name: 'Khezama', delegation_name: 'Sousse Jawhara', governorate_name: 'Sousse' },
  { locality_id: 20, locality_name: 'Centre', delegation_name: 'Ariana Ville', governorate_name: 'Ariana' },
];
const shipment = {
  receiverName: 'Test Client', receiverGov: 'sousse', receiverCity: 'Khezama',
  receiverAddress: 'Rue Test', receiverPhone: '20123456', codAmount: 50,
  productLabel: 'Article', itemsCount: 1,
};

describe('FirstDeliveryService locality validation', () => {
  let service: FirstDeliveryService;
  let request: jest.SpyInstance;
  beforeEach(() => {
    service = new FirstDeliveryService(new ConfigService({ FIRST_DELIVERY_TOKEN: 'test-token' }));
    request = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  function respond(rows: unknown = localities, status = 200) {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ result: rows }), { status }));
    request.mockResolvedValueOnce(new Response(JSON.stringify({ result: { barCode: '123456789012' } }), { status: 201 }));
  }

  it('sends a matching locality and canonical governorate/delegation', async () => {
    respond();
    expect((await service.createShipment(shipment)).ok).toBe(true);
    const body = JSON.parse(request.mock.calls[1][1].body);
    expect(body.Client).toMatchObject({ locality_id: 11, gouvernerat: 'Sousse', ville: 'Sousse Jawhara' });
  });

  it('resolves a delegation entered as the customer city/governorate', async () => {
    respond();
    await service.createShipment({ ...shipment, receiverGov: 'Sousse Jawhara', receiverCity: 'Sousse Jawhara' });
    expect(JSON.parse(request.mock.calls[1][1].body).Client).toMatchObject({ locality_id: 11, gouvernerat: 'Sousse' });
  });

  it('uses address locality within the specified governorate', async () => {
    respond();
    await service.createShipment({ ...shipment, receiverCity: 'Sousse', receiverAddress: 'Rue Test Khezama' });
    expect(JSON.parse(request.mock.calls[1][1].body).Client.locality_id).toBe(11);
  });

  it.each([
    ['unknown destination', localities, 200, 'Unknown'],
    ['unavailable directory', [], 503, 'Sousse'],
    ['invalid directory rows', [{ locality_id: undefined }], 200, 'Sousse'],
    ['error response with rows', localities, 500, 'Sousse'],
  ])('does not POST a shipment for %s', async (_name, rows, status, city) => {
    respond(rows, status as number);
    const result = await service.createShipment({ ...shipment, receiverGov: city as string, receiverCity: city as string });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('localité');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not POST a shipment when the locality lookup throws', async () => {
    request.mockRejectedValueOnce(new Error('network unavailable'));
    expect((await service.createShipment(shipment)).ok).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing city before making any carrier request', async () => {
    const result = await service.createShipment({ ...shipment, receiverGov: '', receiverCity: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('sélectionnez une ville');
    expect(request).not.toHaveBeenCalled();
  });
});
