import { Request } from 'express';
import { JwtPayload } from './jwt-payload.type.js';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
