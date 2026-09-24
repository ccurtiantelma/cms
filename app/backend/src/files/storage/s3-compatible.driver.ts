import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { AppConstants } from '../../common/app-constants';
import { StorageDriver } from './storage-driver.interface';

/**
 * Driver di storage S3-compatibile (ADR-8) — usato in produzione
 * (`STORAGE_DRIVER=s3`). Stesso client per AWS S3 reale e per un MinIO
 * self-hosted (o altro provider S3-compatibile): entrambi parlano l'API S3,
 * cambia solo `AppConstants.storageS3Endpoint` (vuoto = AWS reale, valorizzato
 * = endpoint custom con `forcePathStyle` per compatibilità MinIO).
 */
@Injectable()
export class S3CompatibleDriver implements StorageDriver {
  private readonly logger = new Logger(S3CompatibleDriver.name);
  private readonly client: S3Client;
  private readonly bucket = AppConstants.storageS3Bucket;

  /** Configura il client S3 con endpoint custom (MinIO/altro) o AWS reale se `storageS3Endpoint` è vuoto. */
  constructor() {
    this.client = new S3Client({
      region: AppConstants.storageS3Region,
      endpoint: AppConstants.storageS3Endpoint || undefined,
      forcePathStyle: Boolean(AppConstants.storageS3Endpoint),
      credentials: {
        accessKeyId: AppConstants.storageS3AccessKeyId,
        secretAccessKey: AppConstants.storageS3SecretAccessKey,
      },
    });
  }

  /** Carica il blob nel bucket configurato sotto `key`. */
  async upload(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mimeType }),
    );
    this.logger.log(`File caricato su storage S3 (key=${key}).`);
  }

  /** Restituisce uno stream leggibile del blob salvato sotto `key`. */
  async download(key: string): Promise<NodeJS.ReadableStream> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return response.Body as NodeJS.ReadableStream;
  }

  /** Elimina il blob salvato sotto `key` dal bucket configurato. Già idempotente nativamente: l'API S3 non lancia se `key` non esiste (ADR-11). */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`File rimosso da storage S3 (key=${key}).`);
  }
}
