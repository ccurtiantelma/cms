const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  };
});

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3CompatibleDriver } from '../../../src/files/storage/s3-compatible.driver';

describe('S3CompatibleDriver (unit, S3Client mockato)', () => {
  let driver: S3CompatibleDriver;

  beforeEach(() => {
    mockSend.mockReset();
    driver = new S3CompatibleDriver();
  });

  it('upload invia un PutObjectCommand con Key/Body/ContentType corretti', async () => {
    mockSend.mockResolvedValue({});
    const buffer = Buffer.from('contenuto');

    await driver.upload('key-1', buffer, 'application/pdf');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Key: 'key-1',
      Body: buffer,
      ContentType: 'application/pdf',
    });
  });

  it('download invia un GetObjectCommand e restituisce il Body della risposta', async () => {
    const fakeBody = {};
    mockSend.mockResolvedValue({ Body: fakeBody });

    const result = await driver.download('key-1');

    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({ Key: 'key-1' });
    expect(result).toBe(fakeBody);
  });

  it('delete invia un DeleteObjectCommand con la Key corretta', async () => {
    mockSend.mockResolvedValue({});

    await driver.delete('key-1');

    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({ Key: 'key-1' });
  });
});
