// MinIO S3 Client Configuration
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Response } from "express";
import { Readable } from "stream";
import fs from "fs";
import path from "path";

// Configure S3 client for MinIO
const s3Endpoint = process.env.S3_ENDPOINT;
const s3AccessKey = process.env.S3_ACCESS_KEY || "app-user";
const s3SecretKey = process.env.S3_SECRET_KEY || "";

if (!s3Endpoint) {
  throw new Error("S3_ENDPOINT environment variable is not set.");
}
if (!s3AccessKey) {
  throw new Error("S3_ACCESS_KEY environment variable is not set.");
}
if (!s3SecretKey) {
  throw new Error("S3_SECRET_KEY environment variable is not set.");
}

export const s3Client = new S3Client({
  endpoint: s3Endpoint,
  credentials: {
    accessKeyId: s3AccessKey,
    secretAccessKey: s3SecretKey,
  },
  region: "us-east-1", // MinIO requires a region, even if not used
  forcePathStyle: true, // Required for MinIO
  tls: true, // Use HTTPS
});

// export class ObjectNotFoundError extends Error {
//   constructor() {
//     super("Object not found");
//     this.name = "ObjectNotFoundError";
//     Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
//   }
// }

export class ObjectStorageService {
  constructor() {}

  // getPublicObjectSearchPaths(): Array<string> {
  //   const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  //   const paths = Array.from(
  //     new Set(
  //       pathsStr
  //         .split(",")
  //         .map((path) => path.trim())
  //         .filter((path) => path.length > 0)
  //     )
  //   );
  //   if (paths.length === 0) {
  //     // Default to root bucket search if no paths specified
  //     return ["/"];
  //   }
  //   return paths;
  // }

  // async searchPublicObject(filePath: string): Promise<{ bucketName: string; key: string } | null> {
  //   for (const searchPath of this.getPublicObjectSearchPaths()) {
  //     const fullPath = `${searchPath}/${filePath}`;
  //     const { bucketName, objectName } = parseObjectPath(fullPath);

  //     try {
  //       const headCommand = new HeadObjectCommand({
  //         Bucket: bucketName,
  //         Key: objectName,
  //       });
  //       await s3Client.send(headCommand);
  //       return { bucketName, key: objectName };
  //     } catch (error) {
  //       // Object doesn't exist or other error, continue searching
  //       continue;
  //     }
  //   }

  //   return null;
  // }

  // async downloadObject(objectInfo: { bucketName: string; key: string }, res: Response, cacheTtlSec: number = 3600, checkVisibility: boolean = false) {
  //   try {
  //     // For MinIO/S3, we assume all objects are public for simplicity
  //     // You can implement proper ACL checking if needed
  //     if (checkVisibility) {
  //       // Basic visibility check - in production you might want to implement proper ACL checks
  //       console.warn("Visibility checking not fully implemented for S3 - assuming public");
  //     }

  //     const getCommand = new GetObjectCommand({
  //       Bucket: objectInfo.bucketName,
  //       Key: objectInfo.key,
  //     });

  //     const response = await s3Client.send(getCommand);
      
  //     res.set({
  //       "Content-Type": response.ContentType || "application/octet-stream",
  //       "Content-Length": response.ContentLength?.toString() || "0",
  //       "Cache-Control": `public, max-age=${cacheTtlSec}`,
  //     });

  //     if (response.Body instanceof Readable) {
  //       response.Body.pipe(res);
  //     } else if (response.Body) {
  //       // Convert to stream if needed
  //       const stream = Readable.from(response.Body as any);
  //       stream.pipe(res);
  //     } else {
  //       throw new Error("No content in S3 object");
  //     }
  //   } catch (error) {
  //     console.error("Error downloading file from S3:", error);
  //     if (!res.headersSent) {
  //       res.status(500).json({ error: "Error downloading file" });
  //     }
  //   }
  // }

  /**
   * Upload a file to S3/MinIO
   * @param bucketName The bucket name
   * @param filePath Local file path to upload
   * @param destinationKey S3 object key
   * @returns The S3 object URL
   */
  async uploadFileToS3(bucketName: string, filePath: string, destinationKey: string): Promise<string> {
    try {
      const fileContent = fs.readFileSync(filePath);
      
      const putCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: destinationKey,
        Body: fileContent,
        ContentType: this.getContentType(filePath),
      });

      await s3Client.send(putCommand);
      
      // Return the public URL for the object
      return `${s3Endpoint}/${bucketName}/${destinationKey}`;
    } catch (error) {
      console.error("Error uploading file to S3:", error);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}
