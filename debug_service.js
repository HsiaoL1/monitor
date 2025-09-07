const { NodeSSH } = require('node-ssh');

const serverConfig = {
  host: '47.242.170.252',
  username: 'root',
  password: 'ppG3U%3AKVCL'
};

const testService = {
  name: 'ims_server_active',
  path: '/opt/ims_server_active',
  deployScript: './run.sh'
};

async function debugService() {
  const ssh = new NodeSSH();
  
  try {
    console.log('Connecting to server...');
    await ssh.connect(serverConfig);
    console.log('Connected successfully');

    // Check if directory exists
    console.log('\n1. Checking directory...');
    const dirResult = await ssh.execCommand(`ls -la ${testService.path}`);
    console.log(`Directory check result:`, dirResult);

    // Check if script exists
    console.log('\n2. Checking script...');
    const scriptPath = `${testService.path}/${testService.deployScript}`;
    const scriptResult = await ssh.execCommand(`ls -la ${scriptPath}`);
    console.log(`Script check result:`, scriptResult);

    // Make script executable
    console.log('\n3. Making script executable...');
    const chmodResult = await ssh.execCommand(`chmod +x ${scriptPath}`);
    console.log(`Chmod result:`, chmodResult);

    // Check if service is running
    console.log('\n4. Checking if service is running...');
    const statusResult = await ssh.execCommand(`pgrep -f ${testService.name}`);
    console.log(`Status check result:`, statusResult);

    if (!statusResult.stdout.trim()) {
      // Try to start the service
      console.log('\n5. Attempting to start service...');
      const startCommand = `cd ${testService.path} && bash ${testService.deployScript} > /tmp/${testService.name}_debug.log 2>&1 &`;
      console.log(`Start command: ${startCommand}`);
      
      const startResult = await ssh.execCommand(startCommand);
      console.log(`Start result:`, startResult);

      // Wait and check again
      console.log('\n6. Waiting 3 seconds and checking status...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const verifyResult = await ssh.execCommand(`pgrep -f ${testService.name}`);
      console.log(`Verify result:`, verifyResult);

      // Check logs
      console.log('\n7. Checking logs...');
      const logResult = await ssh.execCommand(`cat /tmp/${testService.name}_debug.log 2>/dev/null || echo "No log file"`);
      console.log(`Log result:`, logResult);

      // Check what's in the service directory
      console.log('\n8. Checking service directory contents...');
      const dirContentResult = await ssh.execCommand(`ls -la ${testService.path}/`);
      console.log(`Directory contents:`, dirContentResult);

      // Try to read the script content (first few lines)
      console.log('\n9. Checking script content...');
      const scriptContentResult = await ssh.execCommand(`head -20 ${scriptPath}`);
      console.log(`Script content:`, scriptContentResult);
    } else {
      console.log('Service is already running');
    }

  } catch (error) {
    console.error('Debug failed:', error);
  } finally {
    ssh.dispose();
  }
}

debugService();