<template>
  <div class="upload">
    <div class="bts">
      <input ref="uploadRef" type="file" @change="handleChangeUpload" />
      <el-button
        size="mini"
        @click="handlePause"
        :disabled="!(checkPercentage === 100 && uploadPercentage < 100)"
        >{{ pauseText }}</el-button
      >
    </div>
    <div class="progress">
      校验文件进度
      <el-progress :percentage="checkPercentage" />
    </div>

    <div class="progress" v-if="checkPercentage === 100">
      上传文件进度
      <el-progress :percentage="uploadPercentage" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import SparkMD5 from "spark-md5";
import request from "@/utils/request";
import axios from "axios";

const uploadRef = ref(null);
const checkPercentage = ref(0);
const uploadPercentage = ref(0);

let pause = false; // 暂停
const pauseText = ref("暂停");
const handlePause = () => {
  pause = !pause;
  // let pText = $("#mytext");
  if (pause) {
    console.log("..pause");
    alert("已经暂停上传！");
    pauseText.value = "继续";
  } else {
    console.log("..go on");
    alert("继续上传...");
    pauseText.value = "暂停";
    responseChange(file);
  }
};

let file = null;
let fileSize = 0;
const handleChangeUpload = () => {
  console.log("handleChangeUpload", uploadRef.value.files);
  const files = uploadRef.value.files;
  // const file = files[0];
  file = files[0];
  fileSize = file.size;
  responseChange(file);
};

// 0.响应点击
let skip = false; // 断点续传，跳过标志
// let globalFileMd5Value = null;
let globalResult = null;
async function responseChange(file) {
  let globalFileMd5Value = null;

  // 如果是断点续传，跳过校验md5
  if (!skip) {
    // 第一步：按照 修改时间+文件名称+最后修改时间-->MD5
    globalFileMd5Value = await md5File(file);
  }
  // 第二步：校验文件的MD5
  globalResult = await checkFileMD5(file.name, globalFileMd5Value);
  console.log(globalResult);
  // 如果文件已存在, 就秒传
  if (globalResult.file) {
    uploadPercentage.value = 100;
    alert("文件已秒传");
    return;
  } else {
    skip = true;
  }
  // 第三步：检查并上传MD5
  await checkAndUploadChunk(globalFileMd5Value, globalResult.chunkList);
  // 第四步: 通知服务器所有分片已上传完成
  // 如果暂停，取消通知文件合成
  if (!pause) {
    notifyServer(globalFileMd5Value);
  }
}

// 1.修改时间+文件名称+最后修改时间-->MD5
function md5File(file) {
  return new Promise((resolve, reject) => {
    var blobSlice =
        File.prototype.slice ||
        File.prototype.mozSlice ||
        File.prototype.webkitSlice,
      chunkSize = file.size / 100,
      chunks = 100,
      currentChunk = 0,
      spark = new SparkMD5.ArrayBuffer(),
      fileReader = new FileReader();

    fileReader.onload = function (e) {
      spark.append(e.target.result); // Append array buffer
      currentChunk++;

      if (currentChunk < chunks) {
        loadNext();
      } else {
        console.log("finished loading");
        let result = spark.end();
        console.log("生成的文件md5", result);
        resolve(result);
      }
    };

    fileReader.onerror = function () {
      console.warn("oops, something went wrong.");
    };

    function loadNext() {
      var start = currentChunk * chunkSize,
        end = start + chunkSize >= file.size ? file.size : start + chunkSize;

      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
      checkPercentage.value = currentChunk + 1;
    }

    loadNext();
  });
}
// 2.校验文件的MD5
const checkFileMD5 = async (fileName, fileMd5Value) => {
  try {
    const res: any = await request.get(
      `/check/file?fileName=${fileName}&fileMd5Value=${fileMd5Value}`
    );
    return res.data;
  } catch (error) {
    console.log("校验出错", error);
  }
  // });
};
// 3.上传chunk
let chunkSize = 1 * 1024 * 1024; // 切片的大小
const checkAndUploadChunk = async (fileMd5Value, chunkList) => {
  let chunks = 0;
  let hasUploaded = 0;
  chunks = Math.ceil(fileSize / chunkSize);
  hasUploaded = chunkList.length;
  for (let i = 0; i < chunks; i++) {
    let exit = chunkList.indexOf(i + "") > -1;
    if (pause) {
      return;
    }
    // 如果已经存在, 则不用再上传当前块
    if (!exit) {
      await upload(i, fileMd5Value, chunks);
      hasUploaded++;
      uploadPercentage.value = Math.floor((hasUploaded / chunks) * 100);
    }
  }
};

// 3-2. 上传chunk
const upload = async (i, fileMd5Value, chunks) => {
  //构造一个表单，FormData是HTML5新增的
  let end = (i + 1) * chunkSize >= file.size ? file.size : (i + 1) * chunkSize;
  let form = new FormData();
  form.append("data", file.slice(i * chunkSize, end)); //file对象的slice方法用于切出文件的一部分
  form.append("total", chunks); //总片数
  form.append("index", i); //当前是第几片
  form.append("fileMd5Value", fileMd5Value);
  try {
    await axios({
      method: "post",
      url: "http://localhost:4000/upload",
      data: form,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }).then((res) => {
      console.log("上传后的结果", res);
    });
  } catch (error) {
    console.log("upload 出错", error);
  }
};

// 第四步: 通知服务器所有分片已上传完成
const notifyServer = async (fileMd5Value) => {
  try {
    const res: any = await request.get(
      "/merge?md5=" +
        fileMd5Value +
        "&fileName=" +
        file.name +
        "&size=" +
        file.size
    );
    return res;
  } catch (error) {
    console.log("合并出错", error);
  }
};
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
.upload {
  width: 500px;
  margin: auto;
}
.bts {
  margin-bottom: 20px;
}
.progress {
  position: relative;
}

.progress-bar {
  transition: width 0.3s ease;
}

.progress .value {
  position: absolute;
  color: #ff9800;
  left: 50%;
}
</style>
