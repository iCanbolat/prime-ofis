import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3"
import { Logger, type OnModuleInit } from "@nestjs/common"

import type { Env } from "../config/env.js"
import { DosyaDeposu } from "./dosya-deposu.js"

/** MinIO / S3 uyumlu depo. Bucket yoksa açılışta oluşturulur (idempotent). */
export class S3DosyaDeposu extends DosyaDeposu implements OnModuleInit {
  private readonly logger = new Logger("DosyaDeposu")
  private readonly client: S3Client
  private readonly bucket: string

  constructor(env: Env) {
    super()
    this.bucket = env.S3_BUCKET
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    })
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch (hata) {
      if (hata instanceof S3ServiceException && hata.$metadata.httpStatusCode === 404) {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
        this.logger.log(`Bucket oluşturuldu: ${this.bucket}`)
        return
      }
      throw hata
    }
  }

  async koy(anahtar: string, icerik: Buffer, mimeType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: anahtar,
        Body: icerik,
        ContentType: mimeType,
        ContentLength: icerik.length,
      })
    )
  }

  async getir(anahtar: string) {
    try {
      const yanit = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: anahtar })
      )
      if (!yanit.Body) return null
      return Buffer.from(await yanit.Body.transformToByteArray())
    } catch (hata) {
      if (hata instanceof NoSuchKey) return null
      throw hata
    }
  }

  async sil(anahtar: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: anahtar })
    )
  }

  async kopyala(kaynak: string, hedef: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: hedef,
        CopySource: `${this.bucket}/${encodeURIComponent(kaynak)}`,
      })
    )
  }

  async temizle() {
    let devam: string | undefined
    do {
      const sayfa = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: devam })
      )
      const nesneler = (sayfa.Contents ?? []).flatMap((n) => (n.Key ? [{ Key: n.Key }] : []))
      if (nesneler.length) {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: nesneler } })
        )
      }
      devam = sayfa.IsTruncated ? sayfa.NextContinuationToken : undefined
    } while (devam)
  }

  async ping() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
  }
}
