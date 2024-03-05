// const inquirer = require('inquirer');
const express = require('express');
const app = express();
const PORT = 3000;

//fs_reg is the regular version of fs, not the promises version as used by multiple async functions!
const fs_reg = require('fs');
const fs = fs_reg.promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
// - modified scope to add ability to read file which in turn allows us to download a file!
const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

//this is a global reference to the file id being watched for changes, used to retrieve the users of this file id in an efficient and smooth manner
//this is a placeholder value and is updated by the 'watchFile' function
let watchedFileId = "1-zbOrgCTbOE_NSu4f2Z2un0c7Yf1jCkT";

let previousUsers = [];
let currentUsers = []

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the names and IDs of fileCount number of files
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 * @param {Number} fileCount The number of files we want to be displayed.
 */
async function listFiles(authClient, fileCount) {
  if(fileCount < 1){
    console.log("A file count of < 1 will not allow  you to see any files so please select something else!")
    return;
  }
  const drive = google.drive({version: 'v3', auth: authClient});
  const res = await drive.files.list({
    pageSize: fileCount,
    fields: 'nextPageToken, files(id, name)',
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log('No files found.');
    return;
  }

  console.log('Files:');
  files.map((file) => {
    console.log(`File : ${file.name} has file id : ${file.id}`);
  });
}

/**
 * Download a static file given a particular file id, destination file name and extension!
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 * @param {string} fileId The file id of a file stored in drive
 * @param {string} fileDestination The destination where the file from drive is to be downloaded!
 * @param {string} extension The extension of the file being downloaded from drive
 * 
 */

async function downloadFile(authClient, fileId, fileDestination, extension){
    const drive = google.drive({version: 'v3', auth: authClient});
    //Modify this is if we want to store the file somewhere else besdies the working directory
    //Remember to end with a /
    const FILE_PATH = "./";
    let dest = fs_reg.createWriteStream(`${FILE_PATH}${fileDestination}.${extension}`);
    drive.files.get({fileId: fileId, alt: 'media'}, {responseType: 'stream'},
        function(err, res){
           res.data
           .on('end', () => {
              console.log(`File downloaded at ${FILE_PATH}${fileDestination}.${extension}`);
           })
           .on('error', err => {
              console.log('Error', err);
           })
           .pipe(dest);
        }
    )
    
}
// /**
//  * NOT NEEDED FOR MOST USECASES!!!
//  * Export a Google editor file
//  * @param {OAuth2Client} authClient An authorized OAuth2 client.
//  * @param {string} fileId The file id of a file stored in drive
//  * 
//  */

// async function exportFile(authClient, fileId){
//     const drive = google.drive({version: 'v3', auth: authClient});
//     try {
//       const res = await drive.files.export({
//         fileId: fileId,
//         mimeType : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
//         // alt : 'media'
//       });
//       console.log(res.status);
//       console.log(res.data["name"]);
//       console.log(res.data.description);
//       console.log(res.data.fileExtension);
//       console.log(res.data['webViewLink']);
//       return res;
//     } catch (err) {
//       // TODO(developer) - Handle error
//       throw err;
//     }
  
// }

/**
 * Lists all users of a file.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 * @param {string} fileId The ID of the file to list users for.
 */
async function listFileUsers(authClient, fileId) {
  const drive = google.drive({version: 'v3', auth: authClient});
  try {
    const res = await drive.permissions.list({
      fileId: fileId,
      fields: 'permissions(id, emailAddress, role, type)',
    });
    const permissions = res.data.permissions;
    if (permissions.length === 0) {
      console.log('No users found.');
      return;
    }

    console.log('Users:');
    permissions.forEach((permission) => {
      // Note: emailAddress might be undefined for non-user permissions (like anyone with the link)
      console.log(`ID: ${permission.id}, Email: ${permission.emailAddress || 'N/A'}, Role: ${permission.role}, Type: ${permission.type}`);
    });
  } catch (err) {
    console.error('The API returned an error: ' + err);
  }
}

/**
 * Helper function to return the email ids of all the users of a file.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 * @param {string} fileId The ID of the file to list users for.
 * @returns {object} A list of email ids (strings) of the file users
 */
async function getFileUsers(authClient, fileId) {
  const drive = google.drive({version: 'v3', auth: authClient});
  try {
    const res = await drive.permissions.list({
      fileId: fileId,
      fields: 'permissions(id, emailAddress, role, type)',
    });
    const permissions = res.data.permissions;
    if (permissions.length === 0) {
      console.log('No users found.');
      return;
    }

    // console.log('Users:');
    //returns all the email ids retrieved from this update! (filters any undefined emails received as a result 
    //  of the user "Anyone with link can view")
    return permissions.map(permission => permission.emailAddress).filter(email => email != undefined);
  } catch (err) {
    console.error('The API returned an error: ' + err);
  }
}


/**
 * Starts 'watching' a file (for any changes).
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 * @param {string} fileId The ID of the file to list users for.
 */
async function watchFile(authClient, fileId) {
  const drive = google.drive({version: 'v3', auth: authClient});
  watchedFileId = fileId;
  try {
    const res = await drive.files.watch({
      fileId: fileId,
      requestBody: {
        type: 'web_hook',
        id: 'unique-watch-21', // A unique string for this watch - must be different than running the app last time!
        address: 'https://e3db-73-238-133-5.ngrok-free.app/updates', // public URL obtained from ngrok for port 3000
        // Optional parameters like expiration time can be set here
      },
    });
    console.log('Watch established', res.data);
  } catch (err) {
    console.error('Error setting up watch:', err);
  }
}

app.get('/testRoute', (req, res) => res.end('Hello from Server!'));

app.post('/updates', (async (req, res) => {
  currentUsers = await authorize().then(authClient => getFileUsers(authClient, watchedFileId)).catch(console.error);

  // console.log(currentUsers, typeof(currentUsers));
  
  //Converting to set allows for O(1)/Costant time access!
  const previousUserSet = new Set(previousUsers);
  const currentUserSet = new Set(currentUsers);

  const addedUsers = currentUsers.filter(email => !previousUserSet.has(email));
  const removedUsers = previousUsers.filter(email => !currentUserSet.has(email));

  if(addedUsers.length !== 0 || removedUsers.length !== 0){
    //shows changes
    addedUsers.forEach(email => {console.log(`Email added : ${email}`)});
    removedUsers.forEach(email => {console.log(`Email removed : ${email}`)});
    console.log("Final list of emails :");
    currentUsers.forEach(email => {console.log(`${email}`)});
    console.log("-------------------------------------------");
  }

  //update state by copying elements from array
  previousUsers = currentUsers.map(elem => elem); //create a deep copy
  res.status(200).send('OK');
}));


/**
 * Inquirer code to prompt user for choices with inquirer!
 */

// Using dynamic import() to load Inquirer
async function loadInquirer() {
  const inquirer = await import('inquirer');
  return inquirer;
}

async function promptUserWithInquirer() {
  const inquirer = (await loadInquirer()).default;

  let continuePrompting = true;

  while(continuePrompting){
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What do you want to do?',
        choices: [
          'List Files',
          'Download a File',
          'List File Users',
          'Subscribe to File Changes',
          'Quit'
        ],
      },
      {
        type: 'input',
        name: 'fileId',
        message: 'Enter the file ID:',
        when: (answers) => answers.action !== 'List Files' && answers.action !== 'Quit',
      },
      {
        type: 'input',
        name: 'extension',
        message: 'Enter the file extension of the file on Google drive (eg : docx, pdf):',
        when: (answers) => answers.action === 'Download a File',
      }, 
      {
        type: 'input',
        name: 'fileDestination',
        message: 'Enter the name for the file you want on your local computer:',
        when: (answers) => answers.action === 'Download a File',
      },
      {
        type: 'input',
        name: 'fileCount',
        message: 'Enter the number of files you want to display:',
        when: (answers) => answers.action === 'List Files',
      },
    ]);
  
    switch (answers.action) {
      case 'List Files':
        // Call function to list files
        authorize().then(authClient => listFiles(authClient, answers.fileCount)).catch(console.error);
        break;
      case 'Download a File':
        // Call function to download file with answers.fileId, answers.fileDestination, answers.extension
        authorize().then(authClient => downloadFile(authClient, answers.fileId, answers.fileDestination, answers.extension)).catch(console.error);
        break;
      case 'List File Users':
        // Call function to list file permissions with answers.fileId
        authorize().then(authClient => listFileUsers(authClient, answers.fileId)).catch(console.error); 
        break;
      case 'Subscribe to File Changes':
        // Call function to subscribe to file changes with answers.fileId
        authorize().then(authClient => watchFile(authClient, answers.fileId)).catch(console.error);
        break;
      case 'Quit':
        console.log('Exiting application...');
        continuePrompting = false;
        break;
      default:
        console.log('Invalid action.');
    }
  }
}




app.listen(PORT, () => {
  console.log(`Node.js App running on port ${PORT}...`);
  console.log(`This Node.js server/app exists just to provide an endpoint for subscribing/listening to any updates in the file we want to listen to`);
});

promptUserWithInquirer().then(() => console.log('Application ended.'));