# Obsidian COS Picbed

这是一个 obsidian 插件，用于自动将图片自动上传到 COS 存储桶，并能在需要删除图片时，同步删除存储桶中的图片文件，减少垃圾图片占用的存储空间。



## 使用说明

首先开通和设置 COS，参考官方教程或网上文章即可，这里不再赘述。然后到藤棍云控制台中获取 SecretId 和 SecretKey，并记下存储桶的相关信息：

1. `SecretId`
2. `SecretKey`
3. `Bucket`（存储桶名称）
4. `Region`（存储桶区域）

然后从 Github 仓库的 release 处下载插件，解压之后放到 `.obsidian/plugins` 目录下，重启 obsidian 再启用 `COS Picbed` 插件即可。插件配置如下：

![image.png](https://yvling-images-1257337367.cos.ap-nanjing.myqcloud.com/0/1743956661826.png)

其中的 `Prefix` 指的是存储桶中的目录名称，图片将存储在这个目录下。

由于直接在插件中调用了 COS 的 SDK，所以会存在跨域问题，解决方案是在存储桶的安全设置中添加 CORS 规则：

```text
app://obsidian.md
```

![image.png](https://yvling-images-1257337367.cos.ap-nanjing.myqcloud.com/0/1743956601246.png)

配置完成之后，直接粘贴图片即可自动上传，需要删除时，只需要右键点击图片，选择 “Delete this image” 即可。

![image.png](https://yvling-images-1257337367.cos.ap-nanjing.myqcloud.com/0/1743957687756.png)

