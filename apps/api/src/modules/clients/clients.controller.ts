import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type ClientDetail,
  type ClientListItem,
  type ClientListQuery,
  clientListQuerySchema,
  type ContactDto,
  type ContactInput,
  contactSchema,
  type CreateClientInput,
  createClientSchema,
  type UpdateClientInput,
  updateClientSchema,
  type UpdateContactInput,
  updateContactSchema,
} from '@salescrm/schemas';
import { CurrentUser, type SessionUser } from '../../common/current-user';
import { RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { ClientsService } from './clients.service';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermission('clients.read')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(clientListQuerySchema)) query: ClientListQuery) {
    return this.clients.list(query, user);
  }

  @Post()
  @RequirePermission('clients.write')
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput,
  ): Promise<ClientListItem> {
    return this.clients.create(user, body);
  }

  @Get(':id')
  @RequirePermission('clients.read')
  get(@Param('id') id: string): Promise<ClientDetail> {
    return this.clients.get(id);
  }

  @Patch(':id')
  @RequirePermission('clients.write')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
  ): Promise<ClientListItem> {
    return this.clients.update(user, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('clients.write')
  archive(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<ClientListItem> {
    return this.clients.archive(user, id);
  }

  @Post(':id/contacts')
  @RequirePermission('clients.write')
  addContact(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(contactSchema)) body: ContactInput,
  ): Promise<ContactDto> {
    return this.clients.addContact(user, id, body);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermission('clients.write')
  updateContact(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContactInput,
  ): Promise<ContactDto> {
    return this.clients.updateContact(user, id, contactId, body);
  }
}
