import {
  Adb,
  AdbDaemonTransport,
  AdbShellProtocolProcess,
  encodeUtf8,
} from '@yume-chan/adb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import {
  AdbDaemonWebUsbDevice,
  AdbDaemonWebUsbDeviceManager,
} from '@yume-chan/adb-daemon-webusb';
import { toast } from 'react-toastify';

async function readShellOutput(
  process: AdbShellProtocolProcess,
): Promise<string> {
  const decoder = new TextDecoder();
  const reader = process.stdout.getReader();
  let output = '';
  while (true) {
    // eslint-disable-next-line no-await-in-loop -- each read() depends on the previous chunk being consumed; this is a sequential stream, not parallelizable
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
  }
  return output;
}

async function encodeDataAsBase64String(data: Blob): Promise<string> {
  return new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      resolve(btoa(binary));
    };
    reader.readAsArrayBuffer(data);
  });
}

async function getAdbConnection(): Promise<Adb | undefined> {
  const Manager: AdbDaemonWebUsbDeviceManager | undefined =
    AdbDaemonWebUsbDeviceManager.BROWSER;

  if (!Manager) {
    toast.error('WebUSB is not supported in this browser');
    return undefined;
  }

  const CredentialStore = new AdbWebCredentialStore();

  const device: AdbDaemonWebUsbDevice | undefined =
    await Manager.requestDevice();
  if (!device) {
    toast.error('No device selected');
    return undefined;
  }

  const connection = await device.connect();
  const adb = new Adb(
    await AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore: CredentialStore,
    }),
  );

  return adb;
}

async function sendDjiGoFileViaAdb(data: Blob) {
  const adb = await getAdbConnection();
  if (!adb) return;

  const base64String = await encodeDataAsBase64String(data);

  // Find an existing waypoint UUID directory to replace
  const waypointBase = `/sdcard/Android/data/dji.go.v5/files/waypoint`;
  const listDirs = await adb.subprocess.shellProtocol!.spawn(
    `ls -1t ${waypointBase}`,
  );
  const dirOutput = await readShellOutput(listDirs);
  const dirs = dirOutput.split('\n').filter(Boolean);
  if (dirs.length === 0) {
    throw new Error(
      `No existing waypoint missions found. Fly a waypoint mission first so DJI registers it in its database.`,
    );
  }
  const uuid = dirs[0];
  const targetFile = `${waypointBase}/${uuid}/${uuid}.kmz`;
  // Diagnostic breadcrumbs for a notoriously flaky hardware transfer -
  // useful when troubleshooting a failed/partial ADB copy in the field.
  // eslint-disable-next-line no-console
  console.log(`Replacing: ${targetFile}`);

  // Send file to phone via ADB STDIN
  const process = await adb.subprocess.shellProtocol!.spawn(
    `sh -c "base64 -d > '${targetFile}'"`,
  );
  const writer = process.stdin.getWriter();
  await writer.write(encodeUtf8(base64String));
  // eslint-disable-next-line no-console -- see above
  console.log(`Copied flightplan to ${targetFile}`);
}

async function sendPotensicProFileViaAdb(data: Blob) {
  const adb = await getAdbConnection();
  if (!adb) return;

  const base64String = await encodeDataAsBase64String(data);

  // Cleanup old journal files
  await adb.subprocess.shellProtocol!.spawn(
    'run-as com.ipotensic.potensicpro rm -f databases/map.db-journal',
  );
  // eslint-disable-next-line no-console -- see sendDjiGoFileViaAdb above
  console.log('Deleted db journal');

  // Send file to phone via ADB STDIN
  const process = await adb.subprocess.shellProtocol!.spawn(
    `run-as com.ipotensic.potensicpro sh -c "base64 -d > databases/test.db"`,
  );
  const writer = process.stdin.getWriter();
  // Send as UTF-8 encoded data
  await writer.write(encodeUtf8(base64String));
  // eslint-disable-next-line no-console -- see sendDjiGoFileViaAdb above
  console.log('Copied flightplan to databases/map.db');
}

export { sendDjiGoFileViaAdb, sendPotensicProFileViaAdb };
