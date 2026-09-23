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

describe('FirstDeliveryService — Akouda regression (word-boundary matching)', () => {
  let service: FirstDeliveryService;
  let request: jest.SpyInstance;
  beforeEach(() => {
    service = new FirstDeliveryService(new ConfigService({ FIRST_DELIVERY_TOKEN: 'test-token' }));
    request = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  // A contrived-but-representative Sousse governorate: a real "Hay Saada"
  // locality under Sousse Jawhara, plus an unrelated Akouda locality
  // ("Aysaad") whose name is a naive substring of "Hay Saada" once spaces
  // are stripped — exactly the class of false positive the old
  // concatenate-and-`.includes()` matching produced.
  const sousseLocalities = [
    { locality_id: 40, locality_name: 'Aysaad', delegation_name: 'Akouda', governorate_name: 'Sousse' },
    { locality_id: 41, locality_name: 'Hay Saada', delegation_name: 'Sousse Jawhara', governorate_name: 'Sousse' },
  ];

  function respond(rows: unknown, status = 200) {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ result: rows }), { status }));
    request.mockResolvedValueOnce(new Response(JSON.stringify({ result: { barCode: '123456789012' } }), { status: 201 }));
  }

  it('does NOT silently insert Akouda for a Sousse + "Hay Saada" order — resolves the real Hay Saada locality instead', async () => {
    respond(sousseLocalities);
    const result = await service.createShipment({
      receiverName: 'Client', receiverGov: 'Sousse', receiverCity: 'Sousse',
      receiverAddress: 'Hay Saada', receiverPhone: '20123456', codAmount: 30,
      productLabel: 'Article', itemsCount: 1,
    });
    expect(result.ok).toBe(true);
    const body = JSON.parse(request.mock.calls[1][1].body);
    expect(body.Client.locality_id).toBe(41);
    expect(body.Client.ville).toBe('Sousse Jawhara');
    expect(body.Client.ville).not.toBe('Akouda');
  });

  it('resolves the same order correctly regardless of dataset array order (not "first match wins")', async () => {
    respond([...sousseLocalities].reverse());
    const result = await service.createShipment({
      receiverName: 'Client', receiverGov: 'Sousse', receiverCity: 'Sousse',
      receiverAddress: 'Hay Saada', receiverPhone: '20123456', codAmount: 30,
      productLabel: 'Article', itemsCount: 1,
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse(request.mock.calls[1][1].body).Client.locality_id).toBe(41);
  });

  it('reports ambiguous (not an arbitrary guess) when the address equally matches two distinct localities', async () => {
    const ambiguousSet = [
      { locality_id: 50, locality_name: 'Centre', delegation_name: 'Msaken', governorate_name: 'Sousse' },
      { locality_id: 51, locality_name: 'Centre', delegation_name: 'Hammam Sousse', governorate_name: 'Sousse' },
    ];
    respond(ambiguousSet);
    const result = await service.createShipment({
      receiverName: 'Client', receiverGov: 'Sousse', receiverCity: 'Sousse',
      receiverAddress: 'Centre', receiverPhone: '20123456', codAmount: 30,
      productLabel: 'Article', itemsCount: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.needsConfirmation).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates?.map((c) => c.localityId).sort()).toEqual([50, 51]);
    // No shipment was ever sent for an unconfirmed, ambiguous destination.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reports ambiguous when the city names a delegation with several localities and the address does not disambiguate', async () => {
    const akoudaSet = [
      { locality_id: 40, locality_name: 'Aysaad', delegation_name: 'Akouda', governorate_name: 'Sousse' },
      { locality_id: 42, locality_name: 'Centre', delegation_name: 'Akouda', governorate_name: 'Sousse' },
    ];
    respond(akoudaSet);
    const result = await service.createShipment({
      receiverName: 'Client', receiverGov: 'Sousse', receiverCity: 'Akouda',
      receiverAddress: 'Rue sans indice', receiverPhone: '20123456', codAmount: 30,
      productLabel: 'Article', itemsCount: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.needsConfirmation).toBe(true);
    expect(result.candidates?.map((c) => c.localityId).sort()).toEqual([40, 42]);
  });

  it('explicit city="Akouda" IS honored when the customer/order data really says Akouda', async () => {
    const akoudaSet = [{ locality_id: 40, locality_name: 'Aysaad', delegation_name: 'Akouda', governorate_name: 'Sousse' }];
    respond(akoudaSet);
    const result = await service.createShipment({
      receiverName: 'Client', receiverGov: 'Sousse', receiverCity: 'Akouda',
      receiverAddress: 'Rue sans indice', receiverPhone: '20123456', codAmount: 30,
      productLabel: 'Article', itemsCount: 1,
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse(request.mock.calls[1][1].body).Client.ville).toBe('Akouda');
  });

  it('bypasses resolution entirely when an admin-confirmed localityId is supplied', async () => {
    respond(sousseLocalities);
    const result = await service.createShipment({
      receiverName: 'Client', receiverGov: 'Sousse', receiverCity: 'Sousse',
      receiverAddress: 'Hay Saada', receiverPhone: '20123456', codAmount: 30,
      productLabel: 'Article', itemsCount: 1,
      localityId: 40, // admin explicitly confirmed Akouda despite the free-text address
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse(request.mock.calls[1][1].body).Client.locality_id).toBe(40);
  });

  it('rejects a confirmed localityId that no longer exists in the First Delivery directory', async () => {
    respond(sousseLocalities);
    const result = await service.createShipment({
      receiverName: 'Client', receiverGov: 'Sousse', receiverCity: 'Sousse',
      receiverAddress: 'Hay Saada', receiverPhone: '20123456', codAmount: 30,
      productLabel: 'Article', itemsCount: 1,
      localityId: 999999,
    });
    expect(result.ok).toBe(false);
    expect(request).toHaveBeenCalledTimes(1); // only the /localities lookup, no /create
  });
});

describe('FirstDeliveryService.previewLocality (admin confirmation UX, no carrier call)', () => {
  let service: FirstDeliveryService;
  let request: jest.SpyInstance;
  beforeEach(() => {
    service = new FirstDeliveryService(new ConfigService({ FIRST_DELIVERY_TOKEN: 'test-token' }));
    request = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('previews the resolved locality without ever calling /create', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({
      result: [{ locality_id: 41, locality_name: 'Hay Saada', delegation_name: 'Sousse Jawhara', governorate_name: 'Sousse' }],
    }), { status: 200 }));
    const resolution = await service.previewLocality('Sousse', 'Sousse', 'Hay Saada');
    expect(resolution).toEqual({
      status: 'resolved',
      locality: { locality_id: 41, locality_name: 'Hay Saada', delegation_name: 'Sousse Jawhara', governorate_name: 'Sousse' },
    });
    expect(request).toHaveBeenCalledTimes(1); // /localities only, never /create
  });
});

describe('FirstDeliveryService.localitiesForGovernorate / localityById (Mo3tamadia picker)', () => {
  let service: FirstDeliveryService;
  let request: jest.SpyInstance;
  beforeEach(() => {
    service = new FirstDeliveryService(new ConfigService({ FIRST_DELIVERY_TOKEN: 'test-token' }));
    request = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  const localities = [
    { locality_id: 10, locality_name: 'Centre', delegation_name: 'Sousse Medina', governorate_name: 'Sousse' },
    { locality_id: 11, locality_name: 'Khezama', delegation_name: 'Sousse Jawhara', governorate_name: 'Sousse' },
    { locality_id: 12, locality_name: 'Aysaad', delegation_name: 'Akouda', governorate_name: 'Sousse' },
    { locality_id: 20, locality_name: 'Centre', delegation_name: 'Ariana Ville', governorate_name: 'Ariana' },
  ];

  it('returns full locality records for the given governorate only, sorted by delegation then locality', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ result: localities }), { status: 200 }));
    const result = await service.localitiesForGovernorate('Sousse');
    expect(result.map((l) => l.locality_id)).toEqual([12, 11, 10]); // Akouda, Sousse Jawhara, Sousse Medina
    expect(result.every((l) => l.governorate_name === 'Sousse')).toBe(true);
  });

  it('never returns a locality from a different governorate', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ result: localities }), { status: 200 }));
    const result = await service.localitiesForGovernorate('Ariana');
    expect(result).toEqual([localities[3]]);
  });

  it('returns an empty list for an unknown governorate rather than throwing', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ result: localities }), { status: 200 }));
    const result = await service.localitiesForGovernorate('Nowhere');
    expect(result).toEqual([]);
  });

  it('returns an empty list for an empty governorate without even calling the directory', async () => {
    const result = await service.localitiesForGovernorate('');
    expect(result).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it('localityById finds the exact record by its immutable id, regardless of governorate filter', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ result: localities }), { status: 200 }));
    const result = await service.localityById(12);
    expect(result).toEqual(localities[2]);
  });

  it('localityById returns null for an id that no longer exists in the live directory', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ result: localities }), { status: 200 }));
    const result = await service.localityById(999999);
    expect(result).toBeNull();
  });
});
