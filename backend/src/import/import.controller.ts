import {
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('banks')
  getBanks() {
    return this.importService.getBanks();
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @UploadedFile() file: Express.Multer.File,
    @Query('banco') banco: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo CSV é obrigatório.');
    if (!banco) throw new BadRequestException('Banco é obrigatório.');

    const csvContent = file.buffer.toString('utf-8');
    return this.importService.preview(banco, csvContent);
  }

  @Post('execute')
  @UseInterceptors(FileInterceptor('file'))
  async execute(
    @UploadedFile() file: Express.Multer.File,
    @Query('banco') banco: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo CSV é obrigatório.');
    if (!banco) throw new BadRequestException('Banco é obrigatório.');

    const csvContent = file.buffer.toString('utf-8');
    return this.importService.execute(banco, csvContent, file.originalname);
  }

  @Get('history')
  async getHistory() {
    return this.importService.getImports();
  }
}
