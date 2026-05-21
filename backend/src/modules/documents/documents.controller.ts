import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import {
  ListDocumentsQueryDto,
} from './dto/upload-document.dto';
import { CurrentTenant, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthContext } from '../../common/types/authenticated-request';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Upload a document for asynchronous processing',
    description:
      'Returns 202 Accepted with the document record in PENDING state. ' +
      'Poll GET /documents/:id (or subscribe to a webhook) to get the result.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthContext,
    @UploadedFile(
      // Validators run BEFORE any disk write — fast rejection of bad input
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 10 * 1024 * 1024, // 10MB (kept in sync with config)
            message: 'File exceeds maximum size of 10MB',
          }),
          new FileTypeValidator({
            // Images only — OCR (Tesseract) cannot read PDFs directly.
            fileType: /^image\/(jpeg|png|webp)$/,
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.documents.upload(tenantId, user.userId!, file);
  }

  @Get()
  @ApiOperation({ summary: 'List documents for the current tenant' })
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documents.list(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single document with its extracted data' })
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.documents.findOne(tenantId, id);
  }
}
