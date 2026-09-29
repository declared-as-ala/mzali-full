import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductDto } from './product.dto';

const check = (plain: object) => validate(plainToInstance(UpdateProductDto, plain), { whitelist: true, forbidNonWhitelisted: true });

describe('UpdateProductDto', () => {
  it('accepts option values as an exact array (a value may contain a comma)', async () => {
    expect(await check({ options: [{ label: 'couleur', type: 'text', values: ['Noir, mat', 'Blanc'] }] })).toHaveLength(0);
  });

  it('still accepts the legacy comma-joined string', async () => {
    expect(await check({ options: [{ label: 'couleur', type: 'text', values: 'Noir,Blanc' }] })).toHaveLength(0);
  });

  it('rejects option values that are neither a string nor an array of strings', async () => {
    expect(await check({ options: [{ label: 'couleur', type: 'text', values: 5 }] })).not.toHaveLength(0);
    expect(await check({ options: [{ label: 'couleur', type: 'text', values: [1, 2] }] })).not.toHaveLength(0);
  });

  it('accepts a single-field patch and the concurrency/purchase fields', async () => {
    expect(await check({ status: 'private' })).toHaveLength(0);
    expect(await check({ purchasePrice: 12.5, expectedRevision: 3 })).toHaveLength(0);
  });

  it('rejects an invalid status, a negative revision, and unknown fields (e.g. another product\'s id)', async () => {
    expect(await check({ status: 'deleted' })).not.toHaveLength(0);
    expect(await check({ expectedRevision: -1 })).not.toHaveLength(0);
    expect(await check({ _id: 'someone-else', id: 'x' })).not.toHaveLength(0);
  });
});
