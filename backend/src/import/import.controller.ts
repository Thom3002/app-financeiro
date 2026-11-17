import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { isPdfBuffer, extractPdfText } from '../services/parsers/pdf.extractor';

function decodeUploadBuffer(buffer: Buffer, banco: string): string {
  if (!buffer || buffer.length === 0) return '';
  if (isPdfBuffer(buffer)) {
    const extracted = extractPdfText(buffer, banco);
    return extracted || '__PDF_NO_TEXT__';
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buffer);
  } catch {
    try {
      const decoder = new TextDecoder('windows-1252');
      return decoder.decode(buffer);
    } catch {
      return buffer.toString('latin1');
    }
  }
}

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
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');
    if (!banco) throw new BadRequestException('Banco é obrigatório.');

    const csvContent = decodeUploadBuffer(file.buffer, banco);
    return this.importService.preview(banco, csvContent);
  }

  @Post('execute')
  @UseInterceptors(FileInterceptor('file'))
  async execute(
    @UploadedFile() file: Express.Multer.File,
    @Query('banco') banco: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo é obrigatório.');
    if (!banco) throw new BadRequestException('Banco é obrigatório.');

    const csvContent = decodeUploadBuffer(file.buffer, banco);
    return this.importService.execute(banco, csvContent, file.originalname);
  }

  @Get('history')
  async getHistory() {
    return this.importService.getImports();
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.importService.deleteImport(id);
  }
}

