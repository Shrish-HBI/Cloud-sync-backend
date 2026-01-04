# TrueBackup API Documentation

## Base URL
```
http://localhost:5000/api/v1
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <access_token>
```

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

## Error Codes

- `VALIDATION_ERROR` - Invalid input data
- `UNAUTHORIZED` - Not authenticated
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `DUPLICATE_ENTRY` - Duplicate entry
- `QUOTA_EXCEEDED` - Storage quota exceeded
- `DOWNLOAD_LIMIT_EXCEEDED` - Download limit exceeded
- `ACCOUNT_SUSPENDED` - Account is suspended
- `RATE_LIMIT_EXCEEDED` - Too many requests

---

## Authentication Endpoints

### Register User
**POST** `/auth/register`

Register a new client account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe",
  "company": "Acme Inc" // optional
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "userId": "uuid"
  }
}
```

**Validation:**
- Email must be valid
- Password: min 8 characters, must contain uppercase, lowercase, and number
- Name: 2-100 characters

---

### Login
**POST** `/auth/login`

Authenticate user and get access token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "roles": ["client"]
    },
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token"
  }
}
```

---

### Logout
**POST** `/auth/logout`

Logout user and invalidate session.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

### Get Profile
**GET** `/auth/profile`

Get current user profile.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "company": "Acme Inc",
    "avatar_url": "https://...",
    "roles": ["client"],
    "client_id": "uuid",
    "storage_quota_gb": 100,
    "storage_used_gb": 25.5,
    "egress_used_gb": 150,
    "egress_free_limit_gb": 2048,
    "status": "active"
  }
}
```

---

### Update Profile
**PUT** `/auth/profile`

Update user profile.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Jane Doe",
  "company": "New Company",
  "avatar_url": "https://example.com/avatar.jpg"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Profile updated successfully"
}
```

---

### Change Password
**POST** `/auth/change-password`

Change user password.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass456"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### Refresh Token
**POST** `/auth/refresh-token`

Get new access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh_token"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "accessToken": "new_jwt_token"
  }
}
```

---

## Client Endpoints

### Get Dashboard Stats
**GET** `/clients/dashboard`

Get client dashboard statistics and alerts.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "stats": {
      "storageQuotaGb": 100,
      "storageUsedGb": 25.5,
      "storageUsedPercent": 25.5,
      "egressUsedGb": 150,
      "egressFreeLimitGb": 2048,
      "egressUsedPercent": 7.32,
      "chargeableEgressGb": 0,
      "filesCount": 245,
      "foldersCount": 18,
      "status": "active"
    },
    "recentActivity": [ ... ],
    "alerts": [ ... ]
  }
}
```

---

### Get Alerts
**GET** `/clients/alerts`

Get all client alerts.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "egress_80",
      "title": "Download Usage Alert",
      "message": "You have used 80% of your free monthly download limit.",
      "is_read": false,
      "is_dismissed": false,
      "created_at": "2026-01-03T10:00:00Z"
    }
  ]
}
```

---

### Mark Alert as Read
**PUT** `/clients/alerts/:alertId/read`

Mark an alert as read.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Alert marked as read"
}
```

---

### Dismiss Alert
**DELETE** `/clients/alerts/:alertId`

Dismiss an alert.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Alert dismissed"
}
```

---

## File Endpoints

### List Files
**GET** `/files`

Get list of files and folders.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `parentId` (optional): UUID of parent folder
- `type` (optional): `file` or `folder`
- `search` (optional): Search term

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Documents",
      "type": "folder",
      "path": "Documents",
      "parent_id": null,
      "created_at": "2026-01-01T00:00:00Z",
      "modified_at": "2026-01-01T00:00:00Z"
    },
    {
      "id": "uuid",
      "name": "report.pdf",
      "type": "file",
      "size_bytes": 1024000,
      "mime_type": "application/pdf",
      "path": "Documents/report.pdf",
      "parent_id": "parent-uuid",
      "s3_key": "client-id/files/...",
      "created_at": "2026-01-02T00:00:00Z",
      "modified_at": "2026-01-02T00:00:00Z"
    }
  ]
}
```

---

### Get File Details
**GET** `/files/:fileId`

Get detailed information about a file.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "report.pdf",
    "type": "file",
    "size_bytes": 1024000,
    "mime_type": "application/pdf",
    "path": "Documents/report.pdf",
    "parent_id": "parent-uuid",
    "s3_key": "...",
    "s3_etag": "...",
    "created_at": "2026-01-02T00:00:00Z",
    "modified_at": "2026-01-02T00:00:00Z"
  }
}
```

---

### Create Folder
**POST** `/files/folders`

Create a new folder.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "New Folder",
  "parentId": "parent-uuid" // optional
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Folder created successfully",
  "data": {
    "folderId": "uuid"
  }
}
```

---

### Get Upload URL
**POST** `/files/upload-url`

Get presigned URL for file upload.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "fileName": "document.pdf",
  "fileSize": 1024000,
  "mimeType": "application/pdf",
  "parentId": "parent-uuid" // optional
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.wasabisys.com/...",
    "fileId": "uuid",
    "s3Key": "client-id/files/...",
    "expiresIn": 3600
  }
}
```

**Upload Flow:**
1. Call this endpoint to get presigned URL
2. Use the URL to upload file directly to S3 (PUT request)
3. Call confirm upload endpoint with the ETag from S3 response

---

### Confirm Upload
**POST** `/files/:fileId/confirm`

Confirm successful file upload to S3.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "etag": "s3-etag-value"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Upload confirmed successfully"
}
```

---

### Get Download URL
**GET** `/files/:fileId/download-url`

Get presigned URL for file download.

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://s3.wasabisys.com/...",
    "fileName": "document.pdf",
    "expiresIn": 3600
  }
}
```

**Note:** This endpoint tracks egress usage and may be blocked if download limit is exceeded.

---

### Delete Files
**DELETE** `/files`

Delete one or multiple files/folders.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "fileIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "3 file(s) deleted successfully",
  "data": {
    "deletedCount": 3
  }
}
```

---

## Rate Limits

- **General API**: 100 requests per 15 minutes
- **Authentication**: 5 requests per 15 minutes
- **File Upload**: 10 requests per minute
- **File Download**: 20 requests per minute

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1609459200
```

---

## File Upload Example (JavaScript)

```javascript
// Step 1: Get upload URL
const response = await fetch('http://localhost:5000/api/v1/files/upload-url', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type
  })
});

const { data } = await response.json();
const { uploadUrl, fileId } = data;

// Step 2: Upload to S3
const uploadResponse = await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type
  }
});

const etag = uploadResponse.headers.get('ETag');

// Step 3: Confirm upload
await fetch(`http://localhost:5000/api/v1/files/${fileId}/confirm`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ etag })
});
```

---

## Admin Endpoints

All admin endpoints require the `admin` role and are prefixed with `/admin`.

- `GET /admin/clients` - List all clients
- `POST /admin/clients` - Create new client
- `PUT /admin/clients/:clientId` - Update client
- `DELETE /admin/clients/:clientId` - Delete client
- `GET /admin/stats` - Get system statistics
- `POST /admin/clients/:clientId/suspend` - Suspend client
- `POST /admin/clients/:clientId/reset-password` - Reset client password

(Full implementation pending - see TODO routes)

---

## Websocket Support

Websocket support for real-time notifications is planned for future releases.

---

## Pagination

Endpoints that return lists support pagination via query parameters:

```
GET /endpoint?limit=20&offset=0
```

Response includes pagination metadata:
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "pages": 8
  }
}
```

---

For more information, see the [README.md](README.md) file.
