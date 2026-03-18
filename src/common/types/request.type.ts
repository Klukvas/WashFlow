import { Request } from 'express';
import { JwtPayload } from './jwt-payload.type';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
