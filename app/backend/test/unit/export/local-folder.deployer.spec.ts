jest.mock('../../../src/common/app-constants', () => ({
  AppConstants: {
    staticExportPath: '/fake/static-export',
  },
}));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));

import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { LocalFolderDeployer } from '../../../src/export/deploy/local-folder.deployer';

const mockedMkdir = mkdir as jest.Mock;
const mockedWriteFile = writeFile as jest.Mock;
const mockedRename = rename as jest.Mock;
const mockedRm = rm as jest.Mock;

describe('LocalFolderDeployer (unit, filesystem mockato)', () => {
  let deployer: LocalFolderDeployer;

  beforeEach(() => {
    jest.clearAllMocks();
    deployer = new LocalFolderDeployer();
  });

  describe('write', () => {
    it('crea ricorsivamente le sottodirectory e scrive tramite file temporaneo + rename atomico', async () => {
      await deployer.write('it-IT/chi-siamo/index.html', '<html></html>');

      expect(mockedMkdir).toHaveBeenCalledWith('/fake/static-export/it-IT/chi-siamo', {
        recursive: true,
      });

      const [tmpPath, content] = mockedWriteFile.mock.calls[0];
      expect(tmpPath).toMatch(/^\/fake\/static-export\/it-IT\/chi-siamo\/index\.html\.tmp-/);
      expect(content).toBe('<html></html>');
      expect(mockedRename).toHaveBeenCalledWith(
        tmpPath,
        '/fake/static-export/it-IT/chi-siamo/index.html',
      );
    });

    it('scrive un Buffer inalterato (asset media)', async () => {
      const buffer = Buffer.from('finto-blob-png');
      await deployer.write('assets/media/aaaaaaaaaaaaaaaa.png', buffer);

      const [, content] = mockedWriteFile.mock.calls[0];
      expect(content).toBe(buffer);
      expect(mockedRename).toHaveBeenCalledWith(
        expect.any(String),
        '/fake/static-export/assets/media/aaaaaaaaaaaaaaaa.png',
      );
    });

    it('sovrascrive in modo sicuro un file già esistente (stesso percorso, secondo write)', async () => {
      await deployer.write('it-IT/pagina/index.html', 'v1');
      await deployer.write('it-IT/pagina/index.html', 'v2');

      expect(mockedWriteFile).toHaveBeenCalledTimes(2);
      expect(mockedRename).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        '/fake/static-export/it-IT/pagina/index.html',
      );
      expect(mockedWriteFile.mock.calls[1][1]).toBe('v2');
    });

    it('rifiuta un percorso relativo che tenta di uscire dalla directory statica (path traversal)', async () => {
      await expect(deployer.write('../../etc/passwd', 'x')).rejects.toThrow(
        'Percorso relativo fuori dalla directory statica',
      );
      expect(mockedWriteFile).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rimuove il file al percorso relativo risolto sotto la radice configurata', async () => {
      await deployer.remove('it-IT/chi-siamo/index.html');

      expect(mockedRm).toHaveBeenCalledWith('/fake/static-export/it-IT/chi-siamo/index.html', {
        force: true,
      });
    });

    it('è innocuo (no-op) se il file non era mai stato scritto: rm({force:true}) non lancia mai qui', async () => {
      await expect(deployer.remove('it-IT/mai/index.html')).resolves.toBeUndefined();
    });

    it('rifiuta un percorso relativo che tenta di uscire dalla directory statica (path traversal)', async () => {
      await expect(deployer.remove('../../etc/passwd')).rejects.toThrow(
        'Percorso relativo fuori dalla directory statica',
      );
      expect(mockedRm).not.toHaveBeenCalled();
    });
  });
});
