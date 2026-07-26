import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AppConstants } from '../common/app-constants';
import { AuthInfo } from '../common/types';
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
