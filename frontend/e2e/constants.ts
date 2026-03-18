import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.resolve(__dirname, '../.auth');

export const STORAGE_STATE = path.resolve(authDir, 'user.json');
export const REGISTRATION_STORAGE_STATE = path.resolve(authDir, 'registration.json');
export const OPERATOR_STORAGE_STATE = path.resolve(authDir, 'operator.json');
export const RECEPTIONIST_STORAGE_STATE = path.resolve(authDir, 'receptionist.json');
export const MANAGER_STORAGE_STATE = path.resolve(authDir, 'manager.json');
