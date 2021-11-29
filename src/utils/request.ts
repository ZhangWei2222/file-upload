import axios from 'axios'
// 创建axios实例
const service = axios.create({
  baseURL: 'http://localhost:4000',
  timeout: 200000, // 请求超时时间
  // withCredentials: true, // 允许携带cookie
})

// request拦截器
service.interceptors.request.use(
  (config: any) => {
    return config
  },
  (error: any) => {
    console.log(error) // for debug
    Promise.reject(error)
  }
)

// response 拦截器
service.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error: any) => {
    console.log(error) // for debug
    Promise.reject(error)
  }
)
export default service
