import get from 'lodash/get';
import { ProjectUtils, UserManager } from '@expo/xdl';
import * as apple from './build/ios/appleApi';
import * as credentials from './build/ios/credentials';
import prompt from '../prompt';
import log from '../log';

export default program => {
  program
    .command('clear-dist-cert [project-dir]')
    .option('-r --revoke', 'Revoke selected distribution certificate on developer.apple.com')
    .description(`Remove Distribution Certificate from Expo's servers`)
    .asyncActionProjectDir(async (projectDir, options) => {
      const { exp: manifest } = await ProjectUtils.readConfigJsonAsync(projectDir);
      const user = await UserManager.ensureLoggedInAsync();
      const projectMetadata = {
        username: user.username,
        experienceName: `@${user.username}/${manifest.slug}`,
        sdkVersion: manifest.sdkVersion,
        bundleIdentifier: get(manifest, 'ios.bundleIdentifier'),
      };
      const credsToClear = {
        distributionCert: true,
      };
      if (options.revoke) {
        const revokeQuestion = [
          {
            type: 'confirm',
            name: 'confirm',
            message: `Please confirm you wish to remove the distribution certificate from Expo's servers and permanently revoke the one you select.`,
          },
        ];
        const { confirm } = await prompt(revokeQuestion);
        if (confirm) {
          const { bundleIdentifier, username, experienceName } = projectMetadata;
          await apple.setup();
          const authData = await apple.authenticate(options);
          const appleCtx = { ...authData, bundleIdentifier, username, experienceName };
          await credentials.clear(projectMetadata, credsToClear);
          await credentials.revoke(appleCtx, Object.keys(credsToClear));
          log.warn('The selected credentials have successfully been revoked.');
        }
      }
      if (!options.revoke) {
        const clearQuestion = [
          {
            type: 'confirm',
            name: 'confirm',
            message: `Please confirm you wish to remove the distribution certificate from Expo's servers.`,
          },
        ];
        const { confirm } = await prompt(clearQuestion);
        if (confirm) {
          await credentials.clear(projectMetadata, credsToClear);
        }
      }
    });
};
