import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class S3Service {
  /**
   * Create S3 client for a specific client's storage configuration
   */
  createClientS3(storageConfig) {
    return new S3Client({
      region: storageConfig.region,
      endpoint: `https://${storageConfig.endpoint}`,
      credentials: {
        accessKeyId: storageConfig.access_key_id,
        secretAccessKey: storageConfig.secret_access_key
      },
      forcePathStyle: true // Required for Wasabi and some S3 providers
    });
  }

  /**
   * Generate presigned URL for file upload using client's S3 config
   */
  async getUploadUrl(storageConfig, key, contentType, fileSize, expiresIn = 3600) {
    try {
      const s3Client = this.createClientS3(storageConfig);
      
      const command = new PutObjectCommand({
        Bucket: storageConfig.bucket_name,
        Key: key,
        ContentType: contentType,
        ContentLength: fileSize
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });
      
      logger.info(`Generated upload URL for: ${key} on bucket ${storageConfig.bucket_name}`);
      return url;
    } catch (error) {
      logger.error('Error generating upload URL:', error);
      throw error;
    }
  }

  /**
   * Generate presigned URL for file download using client's S3 config
   */
  async getDownloadUrl(storageConfig, key, expiresIn = 3600) {
    try {
      const s3Client = this.createClientS3(storageConfig);
      
      const command = new GetObjectCommand({
        Bucket: storageConfig.bucket_name,
        Key: key
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });
      
      logger.info(`Generated download URL for: ${key} from bucket ${storageConfig.bucket_name}`);
      return url;
    } catch (error) {
      logger.error('Error generating download URL:', error);
      throw error;
    }
  }

  /**
   * Delete file from S3 using client's config
   */
  async deleteFile(storageConfig, key) {
    try {
      const s3Client = this.createClientS3(storageConfig);
      
      const command = new DeleteObjectCommand({
        Bucket: storageConfig.bucket_name,
        Key: key
      });

      await s3Client.send(command);
      logger.info(`Deleted file: ${key} from bucket ${storageConfig.bucket_name}`);
      return true;
    } catch (error) {
      logger.error('Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Delete multiple files from S3 using client's config
   */
  async deleteFiles(storageConfig, keys) {
    try {
      const deletePromises = keys.map(key => this.deleteFile(storageConfig, key));
      await Promise.all(deletePromises);
      logger.info(`Deleted ${keys.length} files from bucket ${storageConfig.bucket_name}`);
      return true;
    } catch (error) {
      logger.error('Error deleting multiple files:', error);
      throw error;
    }
  }

  /**
   * Test connection to client's S3 bucket
   */
  async testConnection(storageConfig) {
    try {
      const s3Client = this.createClientS3(storageConfig);
      
      const command = new ListObjectsV2Command({
        Bucket: storageConfig.bucket_name,
        MaxKeys: 1
      });

      await s3Client.send(command);
      logger.info(`S3 connection test successful for bucket ${storageConfig.bucket_name}`);
      return true;
    } catch (error) {
      logger.error('S3 connection test failed:', error);
      return false;
    }
  }

  /**
   * Verify and test client storage configuration
   */
  async verifyStorageConfig(bucketName, endpoint, region, accessKeyId, secretAccessKey) {
    try {
      const storageConfig = {
        bucket_name: bucketName,
        endpoint,
        region,
        access_key_id: accessKeyId,
        secret_access_key: secretAccessKey
      };

      const isValid = await this.testConnection(storageConfig);
      return isValid;
    } catch (error) {
      logger.error('Storage config verification failed:', error);
      return false;
    }
  }

  /**
   * Generate unique S3 key for client file
   */
  generateS3Key(bucketPrefix, filePath) {
    const prefix = bucketPrefix || '';
    const cleanPath = filePath.replace(/^\/+/, ''); // Remove leading slashes
    return prefix ? `${prefix}/${cleanPath}`.replace(/\/+/g, '/') : cleanPath;
  }
}

// Export singleton instance
export default new S3Service();