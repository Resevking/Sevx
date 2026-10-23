// Prüft die Verbindung zu OVHcloud Object Storage und richtet den Bucket ein:
// CORS für Direkt-Uploads aus dem Browser und automatisches Aufräumen
// abgebrochener Multipart-Uploads.
//
//   npm run ovh:setup              # prüfen + konfigurieren
//   npm run ovh:setup -- --create  # Bucket zusätzlich anlegen, falls er fehlt

import {
    CreateBucketCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadBucketCommand,
    PutBucketCorsCommand,
    PutBucketLifecycleConfigurationCommand,
    PutObjectCommand,
    S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function env(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} fehlt in der .env`);
    return value;
}

async function main() {
    const bucket = env('S3_BUCKET');
    const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const s3 = new S3Client({
        endpoint: env('S3_ENDPOINT'),
        region: env('S3_REGION'),
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        credentials: { accessKeyId: env('S3_ACCESS_KEY_ID'), secretAccessKey: env('S3_SECRET_ACCESS_KEY') },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
    });
    console.log(`Endpoint: ${process.env.S3_ENDPOINT} · Region: ${process.env.S3_REGION} · Bucket: ${bucket}\n`);

    // 1. Bucket erreichbar?
    try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
        console.log('✓ Bucket erreichbar');
    } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 && process.argv.includes('--create')) {
            await s3.send(new CreateBucketCommand({ Bucket: bucket }));
            console.log('+ Bucket angelegt');
        } else if (status === 404) {
            throw new Error('Bucket existiert nicht. Lege ihn im OVHcloud Control Panel an oder starte das Skript mit "-- --create".');
        } else if (status === 403) {
            throw new Error('Zugriff verweigert. Prüfe Access Key, Secret Key und die Rechte des S3-Benutzers.');
        } else {
            throw err;
        }
    }

    // 2. CORS – der Browser lädt direkt hoch und braucht dafür den ETag-Header.
    const origins = [appUrl, ...(process.env.CORS_EXTRA_ORIGINS ?? '').split(',').map((o) => o.trim())].filter(Boolean);
    await s3.send(
        new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedOrigins: [...new Set(origins)],
                        AllowedMethods: ['GET', 'PUT', 'HEAD'],
                        AllowedHeaders: ['*'],
                        ExposeHeaders: ['ETag'],
                        MaxAgeSeconds: 3600
                    }
                ]
            }
        })
    );
    console.log(`✓ CORS gesetzt für: ${[...new Set(origins)].join(', ')}`);

    // 3. Abgebrochene Multipart-Uploads nach 2 Tagen automatisch entfernen
    try {
        await s3.send(
            new PutBucketLifecycleConfigurationCommand({
                Bucket: bucket,
                LifecycleConfiguration: {
                    Rules: [{ ID: 'abort-incomplete-uploads', Status: 'Enabled', Filter: { Prefix: '' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 } }]
                }
            })
        );
        console.log('✓ Lifecycle-Regel für abgebrochene Uploads gesetzt');
    } catch (err) {
        console.warn(`! Lifecycle-Regel konnte nicht gesetzt werden (${(err as Error).name}). Der Aufräumjob der App übernimmt das.`);
    }

    // 4. Schreib-/Lese-Test
    const key = `healthcheck/${Date.now()}.txt`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'TrueCloud', ContentType: 'text/plain' }));
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 60 });
    const res = await fetch(url);
    const body = await res.text();
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    if (body !== 'TrueCloud') throw new Error(`Test-Download lieferte Status ${res.status}`);
    console.log('✓ Schreiben, signierter Download und Löschen funktionieren');

    console.log('\nOVHcloud ist bereit.');
}

main().catch((err) => {
    console.error('\n✗', err.message);
    process.exit(1);
});
