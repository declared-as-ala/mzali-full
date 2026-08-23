import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CheckoutDto } from './dto/checkout.dto';

describe('CheckoutDto minimal validation', () => {
  it('validates successfully when only phone is provided in customer', async () => {
    const dto = plainToInstance(CheckoutDto, {
      customer: {
        phone: '20123456',
      },
      items: [
        {
          lineId: 'line-1',
          productId: 'prod-1',
          name: 'Robe élégante',
          price: 89,
          qty: 1,
          image: '/image.jpg',
        },
      ],
      shipping: 8,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('fails when phone is missing in customer', async () => {
    const dto = plainToInstance(CheckoutDto, {
      customer: {
        firstName: 'Ahmed',
      },
      items: [
        {
          lineId: 'line-1',
          productId: 'prod-1',
          name: 'Robe élégante',
          price: 89,
          qty: 1,
          image: '/image.jpg',
        },
      ],
      shipping: 8,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('customer');
  });

  it('validates with all optional fields provided', async () => {
    const dto = plainToInstance(CheckoutDto, {
      customer: {
        firstName: 'Foulen',
        lastName: 'Ben Foulen',
        phone: '20123456',
        email: 'test@example.com',
        city: 'Tunis',
        address: 'Avenue Habib Bourguiba',
        note: 'Livrer le matin',
      },
      items: [
        {
          lineId: 'line-1',
          productId: 'prod-1',
          name: 'Robe élégante',
          price: 89,
          qty: 1,
          image: '/image.jpg',
        },
      ],
      shipping: 8,
      status: 'checkout-draft',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
