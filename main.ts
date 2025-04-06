import COS from "cos-js-sdk-v5";
import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, } from "obsidian";


interface CosPicbedPluginSettings {
	secretId: string;
	secretKey: string;
	bucket: string;
	region: string;
	prefix: string;
}

class CosUploader {
	private cos: any;
	private settings: CosPicbedPluginSettings;
	private updateInterval: NodeJS.Timeout | null = null;

	constructor(settings: CosPicbedPluginSettings) {
		this.settings = settings;

		if (!settings.secretId || !settings.secretKey) {
			throw new Error("SecretId and SecretKey are empty!");
		}

		this.cos = new COS({
			Protocol: "https:",
			SecretId: settings.secretId,
			SecretKey: settings.secretKey,
		});

	}

	public cleanup() {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	// 上传文件
	async uploadFile(file: File): Promise<string> {
		if (!this.settings.bucket || !this.settings.region) {
			throw new Error("Bucket and Region are empty!");
		}

		// 修改文件名
		const originalName = file.name;
		const extension = originalName.split(".").pop();
		const fileName = `${Date.now()}.${extension}`;

		const prefix = this.settings.prefix ? `${this.settings.prefix}/` : "";
		const fullPath = `${prefix}${fileName}`;

		return new Promise((resolve, reject) => {
			this.cos.putObject(
				{
					Bucket: this.settings.bucket,
					Region: this.settings.region,
					Key: fullPath,
					Body: file,
				},
				async (err: any, data: any) => {
					if (err) {
						reject(err);
						return;
					}

					try {
						const url = await this.getUrl(fullPath);
						resolve(url);
					} catch (error) {
						reject(error);
						return;
					}
				}
			);
		});
	}

	// 删除文件
	async deleteFile(fileName: string): Promise<string> {
		const prefix = this.settings.prefix ? `${this.settings.prefix}/` : "";
		const fullPath = `${prefix}${fileName}`;

		return new Promise((resolve, reject) => {
			this.cos.deleteObject(
				{
					Bucket: this.settings.bucket,
					Region: this.settings.region,
					Key: fullPath,
				},
				(err: any, data: any) => {
					if (err) {
						reject(err);
						return;
					}
					resolve(data.Url);
				});
		});
	}

	// 获取图片URL
	private getUrl(fileName: string): Promise<string> {
		return new Promise((resolve, reject) => {
			this.cos.getObjectUrl(
				{
					Bucket: this.settings.bucket,
					Region: this.settings.region,
					Key: fileName,
					Sign: false,
				},
				(err: any, data: any) => {
					if (err) {
						reject(err);
						return;
					}
					resolve(data.Url);
				}
			);
		});
	}
}

class CosPicbedSettingTab extends PluginSettingTab {
	plugin: CosPicbedPlugin;
	private initUploader: () => void;

	constructor(app: App, plugin: CosPicbedPlugin, initUploader: () => void) {
		super(app, plugin);
		this.plugin = plugin;
		this.initUploader = initUploader;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Secret Id")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.secretId)
					.onChange(async (value) => {
						this.plugin.settings.secretId = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Secret Key")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.secretKey)
					.onChange(async (value) => {
						this.plugin.settings.secretKey = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Bucket")
			.addText((text) =>
				text
					.setPlaceholder("example-1250000000")
					.setValue(this.plugin.settings.bucket)
					.onChange(async (value) => {
						this.plugin.settings.bucket = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Region")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("ap-beijing", "Beijing")
					.addOption("ap-chengdu", "Chengdu")
					.addOption("ap-nanjing", "Nanjing")
					.addOption("ap-shanghai", "Shanghai")
					.addOption("ap-hongkong", "Hongkong")
					.addOption("ap-guangzhou", "Guangzhou")
					.addOption("ap-chongqing", "Chongqing")
					.setValue(this.plugin.settings.region)
					.onChange(async (value) => {
						this.plugin.settings.region = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Prefix")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.prefix)
					.onChange(async (value) => {
						let prefix = value.trim().replace(/^\/+|\/+$/g, "");
						this.plugin.settings.prefix = prefix;
						await this.plugin.saveSettings();
					})
			);
	}
}

export default class CosPicbedPlugin extends Plugin {
	settings: CosPicbedPluginSettings;
	private uploader: CosUploader;

	onunload() {
		if (this.uploader) {
			this.uploader.cleanup();
		}
		new Notice("COS Picbed has been uninstalled!");
	}

	async onload() {
		await this.loadSettings();

		// 初始化COS
		if (!this.settings.secretId || !this.settings.secretKey || !this.settings.bucket || !this.settings.region) {
			new Notice("COS configuration is empty!");
		} else {
			this.uploader = new CosUploader(this.settings);
		}
		new Notice("COS Picbed is loaded!");

		// 粘贴图片上传
		this.registerEvent(
			this.app.workspace.on("editor-paste", async (evt: ClipboardEvent, editor: Editor, markdownView: MarkdownView) => {
				const files = evt.clipboardData?.files;
				if (!files || files.length === 0) {
					return;
				}

				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					evt.preventDefault();

					try {
						const activeFile = markdownView.file;
						if (!activeFile) {
							continue;
						}

						const url = await this.uploader.uploadFile(file);
						const pos = editor.getCursor();
						editor.replaceRange(`![${file.name}](${url})`, pos);

						await new Promise((resolve) => setTimeout(resolve, 100));
						await this.app.vault.process(activeFile, (content) => {
							const imageRegex = /!\[\[(.*?)\]\]/g;
							const matches = [...content.matchAll(imageRegex)];

							for (const match of matches) {
								const imagePath = match[1];
								const imageFile = this.findImageFile(imagePath, activeFile);

								if (imageFile instanceof TFile) {
									this.app.fileManager.trashFile(imageFile);
									content = content.replace(`![[${imagePath}]]`, "");
								}
							}

							return content;
						});

						new Notice("Image upload successfully!");
					} catch (error) {
						new Notice("Image upload failed:" + error.message);
					}
				}
			}
			)
		);

		// 右键菜单删除
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				const cursor = editor.getCursor();
				const lineContent = editor.getLine(cursor.line);
				const imageMatch = lineContent.match(/!\[.*?\]\((.*?)\)/);

				if (imageMatch) {
					menu.addItem((item) => {
						item.setTitle("Delete this image")
							.setIcon("trash")
							.onClick(async () => {
								const imageName = imageMatch[1].split('/').pop()!;
								try {
									this.uploader.deleteFile(imageName);
									const newContent = lineContent.replace(imageMatch[0], '');
									editor.setLine(cursor.line, newContent);
									new Notice("Image delete successfully!");
								} catch (error) {
									new Notice("Image delete failed:" + error.message);
								}
							});
					});
				}
			})
		);

		this.addSettingTab(new CosPicbedSettingTab(this.app, this, () => { }));
		this.registerInterval(window.setInterval(() => { }, 5 * 60 * 1000));
	}

	async loadSettings() {
		this.settings = Object.assign(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// 查找图片文件
	private findImageFile(imagePath: string, currentFile: TFile): TFile | null {
		let imageFile = this.app.vault.getAbstractFileByPath(imagePath);
		if (imageFile instanceof TFile && this.isImageFile(imageFile)) {
			return imageFile;
		}

		if (currentFile.parent) {
			const relativePath = `${currentFile.parent.path}/${imagePath}`;
			imageFile = this.app.vault.getAbstractFileByPath(relativePath);
			if (imageFile instanceof TFile && this.isImageFile(imageFile)) {
				return imageFile;
			}
		}

		imageFile = this.app.vault.getAbstractFileByPath(`/${imagePath}`);
		if (imageFile instanceof TFile && this.isImageFile(imageFile)) {
			return imageFile;
		}

		const files = this.app.vault.getFiles();
		return (
			files.find((file) => {
				file.name === imagePath && this.isImageFile(file)
			}) || null
		);
	}

	private isImageFile(file: TFile): boolean {
		return (file.extension.toLowerCase().match(/png|jpg|jpeg|gif|svg|webp/i) !== null);
	}
}