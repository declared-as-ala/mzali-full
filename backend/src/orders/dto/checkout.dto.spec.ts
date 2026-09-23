import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckoutDto } from './checkout.dto';

/**
 * Runs realistic /commande (public checkout) payloads through the exact
 * validation NestJS's global ValidationPipe applies in production
 * (whitelist + forbidNonWhitelisted — see main.ts), so a DTO/field
 * mismatch between the storefront and the backend is caught here rather
 * than only discovered live as a 400 on a real customer's order.
 */
function realisticPayload(overrides: Record<string, unknown> = {}) {
  return {
    customer: {
      firstName: 'Ala Missaoui',
      lastName: '',
      phone: '+21697991266',
      email: 'missaouiala7@gmail.com',
      city: 'Kef',
      locality: 'Jerissa',
      firstDeliveryLocalityId: 12345,
      address: 'monastir',
      note: '',
    },
    items: [
      { lineId: 'l1', productId: 'p1', name: 'yamahha', price: 29, qty: 2, image: 'https://example.com/1.jpg' },
      { lineId: 'l2', productId: 'p2', name: 'chlaka nike', price: 35, qty: 1, image: 'https://example.com/2.jpg' },
    ],
    shipping: 8,
    paymentMethod: 'cod',
    source: 'storefront-next',
    status: 'en-attente',
    ...overrides,
  };
}

describe('CheckoutDto — production ValidationPipe parity', () => {
  it('accepts a full /commande payload including the Localité/Mo3tamadia fields', async () => {
    const instance = plainToInstance(CheckoutDto, realisticPayload());
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toEqual([]);
  });

  it('accepts a payload where locality/firstDeliveryLocalityId were never picked (both optional)', async () => {
    const payload = realisticPayload();
    const customer = payload.customer as Record<string, unknown>;
    delete customer.locality;
    delete customer.firstDeliveryLocalityId;
    const instance = plainToInstance(CheckoutDto, payload);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toEqual([]);
  });

  it('rejects a customer field the DTO does not whitelist (guards against payload/DTO drift)', async () => {
    const payload = realisticPayload();
    (payload.customer as Record<string, unknown>).notARealField = 'x';
    const instance = plainToInstance(CheckoutDto, payload);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-integer firstDeliveryLocalityId', async () => {
    const payload = realisticPayload();
    (payload.customer as Record<string, unknown>).firstDeliveryLocalityId = 'not-a-number';
    const instance = plainToInstance(CheckoutDto, payload);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});
