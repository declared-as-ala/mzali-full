import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Alert, AlertDocument } from './alert.schema';

@Injectable()
export class AlertsService {
  constructor(@InjectModel(Alert.name) private readonly model: Model<Alert>) {}

  async listActive(): Promise<AlertDocument[]> {
    return this.model.find({ resolvedAt: null }).sort({ available: 1 }).limit(200);
  }
}
