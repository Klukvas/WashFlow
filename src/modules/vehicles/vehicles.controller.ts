import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { join } from 'path';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'vehicles');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleQueryDto } from './dto/vehicle-query.dto';

@Controller('vehicles')
@UseGuards(PermissionsGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @Permissions('vehicles.read')
  findAll(@CurrentTenant() tenantId: string, @Query() query: VehicleQueryDto) {
    return this.vehiclesService.findAll(tenantId, query);
  }

  @Get(':id')
  @Permissions('vehicles.read')
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehiclesService.findById(tenantId, id);
  }

  @Post()
  @Permissions('vehicles.create')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('vehicles.update')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('vehicles.delete')
  remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehiclesService.softDelete(tenantId, id);
  }

  @Patch(':id/restore')
  @Permissions('vehicles.update')
  restore(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehiclesService.restore(tenantId, id);
  }

  @Post(':id/photo')
  @Permissions('vehicles.update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, cb) => {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const ext = extname(file.originalname).toLowerCase();
        if (
          !file.mimetype.startsWith('image/') ||
          !allowedExtensions.includes(ext)
        ) {
          cb(
            new BadRequestException(
              `Only image files are allowed (${allowedExtensions.join(', ')})`,
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadPhoto(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const photoUrl = `/uploads/vehicles/${file.filename}`;
    try {
      return await this.vehiclesService.updatePhoto(tenantId, id, photoUrl);
    } catch (error) {
      if (file?.path) {
        await fs.promises.unlink(file.path).catch(() => {});
      }
      throw error;
    }
  }
}
