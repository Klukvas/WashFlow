import { Injectable } from '@nestjs/common';
import { PermissionsRepository } from './permissions.repository';

@Injectable()
export class PermissionsService {
  constructor(private readonly permissionsRepo: PermissionsRepository) {}

  async findAll() {
    return this.permissionsRepo.findAll();
  }

  async findByModule(module: string) {
    return this.permissionsRepo.findByModule(module);
  }
}
