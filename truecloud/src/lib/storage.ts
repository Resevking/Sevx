import 'server-only';
import {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
    UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';

// OVHcloud Object Storage ist S3-kompatibel. Die Dateien liegen in einem einzigen
// Bucket unter "users/<userId>/<fileId>". Der Browser lädt direkt zu OVHcloud hoch
// (vorsignierte URLs), sodass die Daten nicht durch unseren Server fliessen.

const MB = 1024 * 1024;
/** Bis zu dieser Grösse wird mit einem einzigen PUT hochgeladen, darüber mit Multipart. */
export const SINGLE_UPLOAD_LIMIT = 64 * MB;
const MIN_PART_SIZE = 64 * MB;
const MAX_PARTS = 10_000;
/** S3-Limit für ein einzelnes Objekt. */
export const MAX_OBJECT_SIZE = 5 * 1024 * 1024 * MB;
const UPLOAD_URL_TTL = 6 * 60 * 60;
const DOWNLOAD_URL_TTL = 60 * 60;

let client: S3Client | null = null;

export function s3(): S3Client {
    client ??= new S3Client({
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        forcePathStyle: config.s3.forcePathStyle,
        credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
        // Neuere AWS-SDKs hängen standardmässig CRC32-Prüfsummen an, die nicht alle
        // S3-kompatiblen Anbieter unterstützen und vorsignierte Uploads brechen würden.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
    });
    return client;
}

export function storageKeyFor(userId: string, fileId: string): string {
    return `users/${userId}/${fileId}`;
}

export function userPrefix(userId: string): string {
    return `users/${userId}/`;
}

export function partSizeFor(size: number): number {
    let partSize = MIN_PART_SIZE;
    while (Math.ceil(size / partSize) > MAX_PARTS) partSize *= 2;
    return partSize;
}

export function partCountFor(size: number): number {
    return Math.max(1, Math.ceil(size / partSizeFor(size)));
}

export function presignPut(key: string, contentType: string): Promise<string> {
    return getSignedUrl(s3(), new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, ContentType: contentType }), { expiresIn: UPLOAD_URL_TTL });
}

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
    const res = await s3().send(new CreateMultipartUploadCommand({ Bucket: config.s3.bucket, Key: key, ContentType: contentType }));
    if (!res.UploadId) throw new Error('Multipart-Upload konnte nicht gestartet werden');
    return res.UploadId;
}

export function presignPart(key: string, uploadId: string, partNumber: number): Promise<string> {
    return getSignedUrl(s3(), new UploadPartCommand({ Bucket: config.s3.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), {
        expiresIn: UPLOAD_URL_TTL
    });
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
    await s3().send(
        new CompleteMultipartUploadCommand({
            Bucket: config.s3.bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag }))
            }
        })
    );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await s3()
        .send(new AbortMultipartUploadCommand({ Bucket: config.s3.bucket, Key: key, UploadId: uploadId }))
        .catch((err) => console.warn('[storage] Abbruch des Multipart-Uploads fehlgeschlagen', key, err?.name));
}

/** Liefert die tatsächliche Objektgrösse oder null, wenn das Objekt nicht existiert. */
export async function objectSize(key: string): Promise<number | null> {
    try {
        const res = await s3().send(new HeadObjectCommand({ Bucket: config.s3.bucket, Key: key }));
        return res.ContentLength ?? 0;
    } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 || (err as Error).name === 'NotFound' || (err as Error).name === 'NoSuchKey') return null;
        throw err;
    }
}

function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function presignDownload(key: string, filename: string, opts: { inline?: boolean; contentType?: string } = {}): Promise<string> {
    return getSignedUrl(
        s3(),
        new GetObjectCommand({
            Bucket: config.s3.bucket,
            Key: key,
            ResponseContentDisposition: contentDisposition(opts.inline ? 'inline' : 'attachment', filename),
            ResponseContentType: opts.inline ? opts.contentType : undefined
        }),
        { expiresIn: DOWNLOAD_URL_TTL }
    );
}

export async function deleteObjects(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        const res = await s3().send(
            new DeleteObjectsCommand({ Bucket: config.s3.bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } })
        );
        const failed = (res.Errors ?? []).filter((e) => e.Code !== 'NoSuchKey');
        if (failed.length) throw new Error(`Löschen im Storage fehlgeschlagen: ${failed[0].Code} ${failed[0].Message}`);
    }
}

/** Löscht alle Objekte unterhalb eines Präfixes (z. B. beim Löschen eines Kontos). */
export async function deletePrefix(prefix: string): Promise<void> {
    let token: string | undefined;
    do {
        const res = await s3().send(new ListObjectsV2Command({ Bucket: config.s3.bucket, Prefix: prefix, ContinuationToken: token }));
        const keys = (res.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
        if (keys.length) await deleteObjects(keys);
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
}
