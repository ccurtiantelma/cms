import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AppConstants } from '../common/app-constants';
import { AuthInfo, FilesQueryParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { GuardManager } from '../auth/guard';
import { FilesService } from './files.service';
import { FileMetadataDto } from './dto/file-metadata.dto';
import { UploadFileDto } from './dto/upload-file.dto';

/**
 * Endpoint dell'astrazione di storage documenti (ADR-8). Upload/download/
 * delete generici: l'autorizzazione fine (chi può vedere quale documento)
 * resta compito del progetto verticale, che conosce l'associazione
 * `entity`/`entityId` — qui solo autenticazione (JWT middleware globale) e
 * ownership di base sulla cancellazione.
 */
@ApiTags('Files')
@ApiBearerAuth('access-token')
@Controller('app/files')
export class FilesController {
  /** Inietta il service di storage documenti. */
  constructor(private readonly filesService: FilesService) {}

  /** Carica un file (multipart/form-data, campo `file`) ed eventuali metadata di associazione. */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AppConstants.storageMaxFileSizeMb * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Carica un documento (multipart/form-data, campo "file")' })
  @ApiResponse({ status: 201, description: 'File caricato', type: FileMetadataDto })
  @ApiResponse({ status: 413, description: 'File più grande del limite configurato' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @Req() req: Request,
  ): Promise<FileMetadataDto> {
    const authInfo = req['authInfo'] as AuthInfo;
    return this.filesService.upload(file, dto, authInfo, req.ip);
  }

  /**
   * Lista paginata dei file attivi, più recenti prima — solo Admin/Editor
   * (`GuardManager`, esclude il ruolo `User`, RFC-F09 § 1/T1).
   */
  @Get()
  @UseGuards(GuardManager)
  @ApiOperation({ summary: 'Lista paginata dei file attivi (Admin/Editor)' })
  @ApiQuery({ name: 'p', required: false, description: 'Pagina (default 1)' })
  @ApiQuery({ name: 'i', required: false, description: 'Elementi per pagina (default 20)' })
  @ApiQuery({ name: 'q', required: false, description: 'Ricerca su nome file originale' })
  @ApiQuery({
    name: 'mimeType',
    required: false,
    description: 'Filtro per MIME type (match esatto, non prefix)',
  })
  @ApiResponse({ status: 200, description: 'Lista file paginata' })
  async findAll(
    @Query('p') p: string,
    @Query('i') i: string,
    @Query('q') q: string,
    @Query('mimeType') mimeType: string,
    @Req() req: Request,
  ): Promise<Pagination<FileMetadataDto>> {
    const authInfo = req['authInfo'] as AuthInfo;
    const params: FilesQueryParams = {
      p: p ? parseInt(p, 10) : 1,
      i: i ? parseInt(i, 10) : 20,
      q,
      mimeType,
    };
    return this.filesService.list(params, authInfo);
  }

  /**
   * Scarica il blob associato a `guid` in streaming.
   * Usa `@Res()` senza `passthrough` (a differenza del resto del codebase):
   * lo streaming del body richiede controllo diretto della risposta, non solo
   * l'impostazione di header/cookie.
   */
  @Get(':guid')
  @ApiOperation({ summary: 'Scarica il contenuto di un file (streaming)' })
  @ApiResponse({ status: 200, description: 'Contenuto del file' })
  @ApiResponse({ status: 404, description: 'File non trovato o eliminato' })
  async download(@Param('guid') guid: string, @Res() res: Response): Promise<void> {
    const { stream, mimeType, originalName } = await this.filesService.download(guid);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`,
    );
    stream.pipe(res);
  }

  /** Elimina (soft-delete) il file — solo l'autore o un ruolo Admin/superiore. */
  @Delete(':guid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Elimina un file (soft-delete, blob fisico non rimosso subito — vedi ADR-8)',
  })
  @ApiResponse({ status: 204, description: 'File eliminato' })
  @ApiResponse({
    status: 403,
    description: "Non sei l'autore del file e non hai un ruolo Admin/superiore",
  })
  @ApiResponse({ status: 404, description: 'File non trovato o già eliminato' })
  async delete(@Param('guid') guid: string, @Req() req: Request): Promise<void> {
    const authInfo = req['authInfo'] as AuthInfo;
    await this.filesService.softDelete(guid, authInfo, req.ip);
  }
}
