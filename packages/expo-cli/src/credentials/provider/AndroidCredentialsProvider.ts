import { CredentialsSource } from '../../easJson';
import log from '../../log';
import { Context } from '../context';
import { Keystore } from '../credentials';
import * as credentialsJsonReader from '../credentialsJson/read';
import { runCredentialsManager } from '../route';
import { SetupAndroidKeystore } from '../views/SetupAndroidKeystore';
import { CredentialsProvider } from './provider';

export interface AndroidCredentials {
  keystore: Keystore;
}

interface AppLookupParams {
  projectName: string;
  accountName: string;
}

interface Options {
  nonInteractive: boolean;
}

export default class AndroidCredentialsProvider implements CredentialsProvider {
  public readonly platform = 'android';
  private readonly ctx = new Context();

  constructor(private projectDir: string, private app: AppLookupParams, private options: Options) {}

  private get projectFullName(): string {
    const { projectName, accountName } = this.app;
    return `@${accountName}/${projectName}`;
  }

  public async initAsync() {
    await this.ctx.init(this.projectDir, {
      nonInteractive: this.options.nonInteractive,
    });
  }

  public async hasRemoteAsync(): Promise<boolean> {
    const keystore = await this.ctx.android.fetchKeystore(this.projectFullName);
    return this.isValidKeystore(keystore);
  }

  public async hasLocalAsync(): Promise<boolean> {
    if (!(await credentialsJsonReader.fileExistsAsync(this.projectDir))) {
      return false;
    }
    try {
      const rawCredentialsJson = await credentialsJsonReader.readRawAsync(this.projectDir);
      return !!rawCredentialsJson?.android;
    } catch (err) {
      log.error(err); // malformed json
      return false;
    }
  }

  public async isLocalSyncedAsync(): Promise<boolean> {
    try {
      const [remote, local] = await Promise.all([
        this.ctx.android.fetchKeystore(this.projectFullName),
        await credentialsJsonReader.readAndroidCredentialsAsync(this.projectDir),
      ]);
      const r = remote!;
      const l = local?.keystore!;
      return !!(
        r.keystore === l.keystore &&
        r.keystorePassword === l.keystorePassword &&
        r.keyAlias === l.keyAlias &&
        r.keyPassword === l.keyPassword &&
        this.isValidKeystore(r)
      );
    } catch (_) {
      return false;
    }
  }

  public async getCredentialsAsync(
    src: CredentialsSource.LOCAL | CredentialsSource.REMOTE
  ): Promise<AndroidCredentials> {
    switch (src) {
      case CredentialsSource.LOCAL:
        return await this.getLocalAsync();
      case CredentialsSource.REMOTE:
        return await this.getRemoteAsync();
    }
  }

  private async getRemoteAsync(): Promise<AndroidCredentials> {
    await runCredentialsManager(
      this.ctx,
      new SetupAndroidKeystore(this.projectFullName, {
        allowMissingKeystore: false,
      })
    );
    const keystore = await this.ctx.android.fetchKeystore(this.projectFullName);
    if (!keystore || !this.isValidKeystore(keystore)) {
      throw new Error('Unable to set up credentials');
    }
    return { keystore };
  }

  private async getLocalAsync(): Promise<AndroidCredentials> {
    const credentials = await credentialsJsonReader.readAndroidCredentialsAsync(this.projectDir);
    if (!this.isValidKeystore(credentials.keystore)) {
      throw new Error('Invalid keystore in credentials.json');
    }
    return credentials;
  }

  private isValidKeystore(keystore?: Keystore | null) {
    return !!(
      keystore &&
      keystore.keystore &&
      keystore.keystorePassword &&
      keystore.keyPassword &&
      keystore.keyAlias
    );
  }
}
