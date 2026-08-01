import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { PluggyService } from './pluggy.service';

@Controller('pluggy')
export class PluggyController {
  constructor(private readonly pluggyService: PluggyService) {}

  @Get('config')
  async getConfig() {
    return this.pluggyService.getCredentialsConfig();
  }

  @Post('config')
  async saveConfig(@Body() body: { clientId: string; clientSecret: string }) {
    return this.pluggyService.saveCredentials(body.clientId, body.clientSecret);
  }

  @Post('connect-token')
  async createConnectToken(@Body() body?: { clientUserId?: string }) {
    return this.pluggyService.createConnectToken(body?.clientUserId);
  }

  @Get('connections')
  async getConnections() {
    return this.pluggyService.getConnections();
  }

  @Post('sync')
  async sync(@Body() body?: { itemId?: string }) {
    return this.pluggyService.syncItem(body?.itemId);
  }

  @Delete('connections/:id')
  async deleteConnection(@Param('id') id: string) {
    return this.pluggyService.deleteConnection(id);
  }
}
