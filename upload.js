let express = require('express')
let formidable = require('formidable')
let app = express()
let fs = require('fs-extra')
let path = require('path')
let concat = require('concat-files')
let opn = require('opn')
const crypto = require('crypto');
const multiparty = require("multiparty");

let uploadDir = 'nodeServer/uploads'
// 处理静态资源
app.use(express.static(path.join(__dirname)))

// 处理跨域
app.all('*', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type,Content-Length, Authorization, Accept,X-Requested-With'
  )
  res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS')
  res.header('X-Powered-By', ' 3.2.1')
  if (req.method == 'OPTIONS') res.sendStatus(200) /*让options请求快速返回*/
  else next()
})

app.get('/', function (req, res) {
  let query = req.query
  res.send('success!!')
})

// 检查文件的MD5
app.get('/check/file', (req, res) => {
  const { fileName, fileMd5Value } = req.query
  // 获取文件Chunk列表
  getChunkList(
    path.join(uploadDir, fileName),
    path.join(uploadDir, fileMd5Value),
    data => {
      res.send(data)
    }
  )
})

app.get('/merge', (req, res) => {
  const { md5, size, fileName } = req.query
  mergeFiles(path.join(uploadDir, md5), uploadDir, fileName, size, md5)
  res.send({
    code: 0,
    data: {
      msg: '合并成功'
    }
  })
})

app.post('/upload', (req, res) => {
  const multipart = new multiparty.Form();
  multipart.parse(req, async (err, fields, file) => {
    let index = (fields.index[0])
    let total = (fields.total[0])
    let fileMd5Value = fields.fileMd5Value[0]
    let data = file.data[0]
    let folder = path.resolve(__dirname, 'nodeServer/uploads', fileMd5Value)
    folderIsExit(folder).then(val => {
      let destFile = path.resolve(folder, index)
      copyFile(data.path, destFile).then(
        successLog => {
          res.send({
            code: 0,
            data: {
              index
            }
          })
        },
        errorLog => {
          res.send({
            code: 0,
            msg: 'Error'
          })
        }
      )
    })
  })
  // 文件夹是否存在, 不存在则创建文件
  function folderIsExit(folder) {
    return new Promise(async (resolve, reject) => {
      let result = await fs.ensureDirSync(path.join(folder))
      resolve(true)
    })
  }
  // 把文件从一个目录拷贝到别一个目录
  function copyFile(src, dest) {
    let promise = new Promise((resolve, reject) => {
      // console.log('========拷贝', src, dest)
      fs.rename(src, dest, err => {
        if (err) {
          reject(err)
        } else {
          resolve('copy file:' + dest + ' success!')
        }
      })
    })
    return promise
  }
})

// 获取文件Chunk列表
async function getChunkList(filePath, folderPath, callback) {
  let isFileExit = await isExist(filePath)
  let result = {}
  // 如果文件(文件名, 如:node-v7.7.4.pkg)已在存在, 不用再继续上传, 真接秒传
  if (isFileExit) {
    result = {
      code: 0,
      data: {
        file: {
          isExist: true,
          name: filePath
        },
        msg: '文件已存在'
      }
    }
  } else {
    let isFolderExist = await isExist(folderPath)
    // 如果文件夹(md5值后的文件)存在, 就获取已经上传的块
    let fileList = []
    if (isFolderExist) {
      fileList = await listDir(folderPath)
    }
    result = {
      code: 0,
      data: {
        chunkList: fileList,
        msg: '已上传的文件列表'
      }

    }
  }
  callback(result)
}

// 文件或文件夹是否存在
function isExist(filePath) {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      // 文件不存在
      if (err && err.code === 'ENOENT') {
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

// 列出文件夹下所有文件
function listDir(path) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, (err, data) => {
      if (err) {
        reject(err)
      }
      // 把mac系统下的临时文件去掉
      if (data && data.length > 0 && data[0] === '.DS_Store') {
        data.splice(0, 1)
      }
      resolve(data)
    })
  })
}

// 检查文件的完整性
let computedHex = (fileName, md5, size) => {
  let rs = fs.createReadStream(fileName)
  let hash = crypto.createHash('md5')
  let hex

  rs.on('data', hash.update.bind(hash))

  rs.on('end', () => {
    hex = hash.digest('hex')
    let complete = hex === md5
    console.log('文件名：' + fileName)
    console.log('文件大小：' + size)
    console.log('文件完整性：' + complete)
  })
}
// 合并文件
async function mergeFiles(srcDir, targetDir, newFileName, size, md5) {
  console.log('------------mergeFiles', ...arguments)
  let fileArr = await listDir(srcDir)
  // 按照分割的数据块顺序组装这个文件
  fileArr.sort((x, y) => {
    return x - y;
  })
  // 把文件名加上文件夹的前缀
  for (let i = 0; i < fileArr.length; i++) {
    fileArr[i] = srcDir + '/' + fileArr[i]
  }
  console.log('fileArr', fileArr)
  concat(fileArr, path.join(targetDir, newFileName), () => {
    console.log('Merge Success!')
    computedHex(path.join(targetDir, newFileName), md5, size)
  })
}

app.listen(4000, () => {
  console.log('服务启动完成，端口监听4000！')
  // opn('http://localhost:4000')
})
