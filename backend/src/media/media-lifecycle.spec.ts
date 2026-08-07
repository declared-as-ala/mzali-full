import { MediaService } from './media.service';

const id = '507f1f77bcf86cd799439011';

function setup(removeObject: jest.Mock) {
  const doc = {
    id,
    _id: id,
    bucket: 'catalog',
    objectKey: 'original.jpg',
    orphanedAt: new Date(),
    variants: [{ objectKey: 'thumb.webp' }, { objectKey: 'md.webp' }],
  };
  const model = {
    findOne: jest.fn().mockResolvedValue(doc),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  };
  const service = new MediaService(model as never, { removeObject } as never, {} as never);
  return { service, model };
}

describe('media orphan deletion lifecycle', () => {
  it('deletes original and variants only after the caller selected an orphan', async () => {
    const removeObject = jest.fn().mockResolvedValue(undefined);
    const { service, model } = setup(removeObject);
    await expect(service.deleteOrphaned(id)).resolves.toBe(true);
    expect(removeObject.mock.calls.map((call) => call[1])).toEqual(['original.jpg', 'thumb.webp', 'md.webp']);
    expect(model.deleteOne).toHaveBeenCalledTimes(1);
  });

  it('keeps the media document retryable when MinIO deletion fails', async () => {
    const removeObject = jest.fn().mockRejectedValue(new Error('MinIO unavailable'));
    const { service, model } = setup(removeObject);
    await expect(service.deleteOrphaned(id)).resolves.toBe(false);
    expect(model.deleteOne).not.toHaveBeenCalled();
  });
});
