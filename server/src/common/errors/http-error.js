export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorized = (message = 'กรุณาเข้าสู่ระบบ') => new HttpError(401, message);
export const forbidden = (message = 'ไม่มีสิทธิ์เข้าถึง') => new HttpError(403, message);
export const notFound = (message = 'ไม่พบข้อมูล') => new HttpError(404, message);
