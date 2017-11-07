var FS = require("fire-fs");
var PATH = require('fire-path');
var CfgUtil = Editor.require("packages://plugin-bugly/core/CfgUtil");
var fse = require('fs-extra');
var rimraf = require('rimraf');

Editor.Panel.extend({
    style: FS.readFileSync(Editor.url('packages://plugin-bugly/panel/index.html', 'utf8')) + "",
    template: FS.readFileSync(Editor.url('packages://plugin-bugly/panel/index.html', 'utf8')) + "",

    $: {
        logTextArea: '#logTextArea',
    },

    ready() {
        let logCtrl = this.$logTextArea;
        let logListScrollToBottom = function () {
            setTimeout(function () {
                logCtrl.scrollTop = logCtrl.scrollHeight;
            }, 10);
        };

        window.plugin = new window.Vue({
            el: this.shadowRoot,
            created() {
                console.log("created");
                this.initPlugin();
            },
            data: {
                gameID: "",
                preGameID: "",
                logView: [],

            },
            methods: {
                _addLog(str) {
                    let time = new Date();
                    // this.logView = "[" + time.toLocaleString() + "]: " + str + "\n" + this.logView;
                    this.logView += "[" + time.toLocaleString() + "]: " + str + "\n";
                    logListScrollToBottom();
                },
                initPlugin() {
                    CfgUtil.initCfg(function (data) {
                        if (data) {
                            console.log(data);
                            this.gameID = data.gameID;
                        }
                    }.bind(this))
                },
                onLogViewMenu(event) {
                    Editor.Ipc.sendToMain('plugin-bugly:popup-create-menu', event.x, event.y, null);
                },
                onChangeGameID() {
                    let oldGameID = CfgUtil.getGameID();
                    if (oldGameID === this.gameID) {
                        return;
                    }

                    // 替换code值
                    let projectPath = Editor.projectInfo.path;
                    let buildCfg = PATH.join(projectPath, "local/builder.json");
                    if (!FS.existsSync(buildCfg)) {
                        this._addLog("发现没有构建项目, 使用前请先构建项目!");
                        return;
                    }


                    let data = FS.readFileSync(buildCfg, 'utf-8');
                    let buildData = JSON.parse(data);
                    let buildFullDir = PATH.join(projectPath, buildData.buildPath);
                    let AppDelegateCppFilePath = PATH.join(buildFullDir,
                        "jsb-" + buildData.template + "/frameworks/runtime-src/Classes/AppDelegate.cpp");

                    if (FS.existsSync(AppDelegateCppFilePath)) {
                        let fileData = FS.readFileSync(AppDelegateCppFilePath, 'utf-8');
                        let gameIDFlag = "CrashReport::initCrashReport(\"" + oldGameID + "\", false);";
                        let newGameIDString = "CrashReport::initCrashReport(\"" + this.gameID + "\", false);";
                        if (fileData.indexOf(gameIDFlag) >= 0) {
                            fileData = fileData.replace(gameIDFlag, newGameIDString);
                            FS.writeFileSync(AppDelegateCppFilePath, fileData);
                            this._addLog("文件成功更新GameID: " + AppDelegateCppFilePath);
                        }
                    }
                    CfgUtil.setGameID(this.gameID);
                },
                _checkIsBuildProject() {
                    let projectDir = path.join(Editor.assetdb.library, "../");
                    let buildCfg = path.join(projectDir, "local/builder.json");
                    if (FileUtil.isFileExit(buildCfg)) {
                        fs.readFile(buildCfg, 'utf-8', function (err, data) {
                            if (!err) {
                                let buildData = JSON.parse(data);
                                let buildDir = buildData.buildPath;
                                let buildFullDir = path.join(projectDir, buildDir);
                                let jsbDir = path.join(buildFullDir, "jsb-default");
                                this._checkResourceRootDir(jsbDir);
                            }
                        }.bind(this))
                    } else {
                    }
                },

                onAddBuglySdk() {
                    let projectPath = Editor.projectInfo.path;
                    let buildCfg = PATH.join(projectPath, "local/builder.json");
                    if (!FS.existsSync(buildCfg)) {
                        this._addLog("发现没有构建项目, 使用前请先构建项目!");
                        return;
                    }


                    let data = FS.readFileSync(buildCfg, 'utf-8');
                    let buildData = JSON.parse(data);
                    let buildFullDir = PATH.join(projectPath, buildData.buildPath);


                    let version = '1.4.3';
                    let buglyResPath = PATH.join(projectPath, 'packages/plugin-bugly/bugly/' + version);


                    // 1.拷贝jar包
                    /* 将
                        CocosPlugin\agent\Android\bugly_agent.jar
                        BuglySDK\Android\bugly_crash_release.jar
                       拷贝到
                        Android工程的frameworks\runtime-src\proj.android-studio\app\libs\
                    */

                    function step1() {
                        window.plugin._addLog("copy jar ..");
                        // 拷贝的源目录
                        let agentJar = PATH.join(buglyResPath, "libs/bugly_agent.jar");
                        let crashJar = PATH.join(buglyResPath, "libs/bugly_crash_release.jar");
                        let jarPath = PATH.join(buglyResPath, "libs");
                        if (!FS.existsSync(jarPath)) {
                            window.plugin._addLog("没有发现插件bugly的jar文件");
                            return;
                        }

                        // 拷贝的目标目录
                        let projAndroidStudio = PATH.join(buildFullDir, "jsb-" + buildData.template + "/frameworks/runtime-src/proj.android-studio/");

                        if (!FS.existsSync(projAndroidStudio)) {
                            window.plugin._addLog("请构建项目,项目目录不存在:" + projAndroidStudio);
                            return;
                        }

                        let desJarDir = PATH.join(projAndroidStudio, "app/libs/");
                        if (!FS.existsSync(desJarDir)) {
                            window.plugin._addLog("android studio工程未编译,请编译as项目");
                            return;
                        }

                        fse.copy(jarPath, desJarDir, function (err) {
                            if (err) {
                                window.plugin._addLog("copy jar failed!");
                                console.log(err);
                            } else {
                                window.plugin._addLog("copy jar success!");
                                step2();
                            }
                        });
                    };


                    // 2.拷贝so库
                    /* 将
                        BuglySDK\Android\libs\armeabi-v7a文件夹
                       拷贝到
                        jsb-default\frameworks\runtime-src\proj.android-studio\app\jni\prebuilt，
                    *  如果prebuilt文件夹不存在就创建一下，如果还需要其他ABI就拷贝相应的，比如常用于模拟器的x86。
                    * */

                    function step2() {
                        window.plugin._addLog("copy so ..");
                        let prebuilt = PATH.join(buildFullDir,
                            "jsb-" + buildData.template +
                            "/frameworks/runtime-src/proj.android-studio/app/jni/prebuilt");

                        if (!FS.existsSync(prebuilt)) {
                            FS.mkdirSync(prebuilt);
                            window.plugin._addLog("创建 prebuilt 文件夹");
                        }

                        let prebuiltPath = PATH.join(buglyResPath, "prebuilt");
                        if (!FS.existsSync(prebuiltPath)) {
                            window.plugin._addLog("没有发现插件的prebuilt文件");
                            return;
                        }
                        fse.copy(prebuiltPath, prebuilt, function (err) {
                            if (err) {
                                window.plugin._addLog("copy so failed!");
                                console.log(err);
                            } else {
                                window.plugin._addLog("copy so success!");
                                step3();
                            }
                        });
                    }

                    // 3.拷贝代码
                    /* 将
                        CocosPlugin\bugly文件夹
                       拷贝到
                        frameworks\runtime-src\Classes里面
                       其实只需要用到CrashReport.h和CrashReport.mm，
                    */
                    function step3() {
                        window.plugin._addLog("copy code ..");

                        let buglyPath = PATH.join(buglyResPath, "bugly");
                        if (!FS.existsSync(buglyPath)) {
                            window.plugin._addLog("没有发现插件的bugly代码文件");
                            return;
                        }

                        let classPath = PATH.join(buildFullDir,
                            "jsb-" + buildData.template + "/frameworks/runtime-src/Classes/bugly");
                        if (!FS.existsSync(classPath)) {
                            FS.mkdirSync(classPath);
                        }

                        fse.copy(buglyPath, classPath, function (err) {
                            if (err) {
                                window.plugin._addLog("copy code failed!");
                                console.log(err);
                            } else {
                                window.plugin._addLog("copy code success!");
                                step4();
                            }
                        })

                    }

                    // 4.修改Android.mk
                    function step4() {

                        let mkFile = PATH.join(buildFullDir,
                            "jsb-" + buildData.template + "/frameworks/runtime-src/proj.android-studio/app/jni/Android.mk");

                        if (!FS.existsSync(mkFile)) {
                            window.plugin._addLog("不存在mk文件: " + mkFile);
                            doFailed();
                            return;
                        }

                        let data = FS.readFileSync(mkFile, 'utf-8');
                        // 增加bugly.so模块
                        let buglySoFlag =
                            "LOCAL_PATH := $(call my-dir)\n" +
                            "# --- bugly: 引用 libBugly.so ---\n" +
                            "include $(CLEAR_VARS)\n" +
                            "LOCAL_MODULE := bugly_native_prebuilt\n" +
                            "LOCAL_SRC_FILES := prebuilt/$(TARGET_ARCH_ABI)/libBugly.so\n" +
                            "include $(PREBUILT_SHARED_LIBRARY)\n" +
                            "# --- bugly: end ---";
                        if (data.indexOf(buglySoFlag) === -1) {
                            data = data.replace("LOCAL_PATH := $(call my-dir)", buglySoFlag);
                            window.plugin._addLog("[Android.mk] 增加libBugly.so引用");
                        } else {
                            window.plugin._addLog("[Android.mk] 已经增加libBugly.so引用");
                        }

                        // 增加CrashReport.mm编译文件
                        let AppDelegateFlag =
                            "\t\t\t\t   ../../../Classes/AppDelegate.cpp \\\n" +
                            "\t\t\t\t   ../../../Classes/bugly/CrashReport.mm \\\n";
                        if (data.indexOf(AppDelegateFlag) === -1) {
                            data = data.replace("\t\t\t\t   ../../../Classes/AppDelegate.cpp \\\n", AppDelegateFlag);
                            window.plugin._addLog("[Android.mk] 增加CrashReport.mm引用");
                        } else {
                            window.plugin._addLog("[Android.mk] 已经增加CrashReport.mm引用");
                        }

                        // 导入bugly
                        let extFlag =
                            "# --- bugly: 增加cpp扩展名mm\n" +
                            "LOCAL_CPP_EXTENSION := .mm .cpp .cc\n" +
                            "LOCAL_CFLAGS += -x c++\n" +
                            "LOCAL_SRC_FILES := hellojavascript/main.cpp";
                        if (data.indexOf(extFlag) === -1) {
                            data = data.replace("LOCAL_SRC_FILES := hellojavascript/main.cpp", extFlag);
                            window.plugin._addLog("[Android.mk] 增加cpp扩展名mm");
                        } else {
                            window.plugin._addLog("[Android.mk] 已经增加cpp扩展名mm");
                        }

                        FS.writeFileSync(mkFile, data);
                        step5();
                    }

                    // 5.修改AppDelegate.cpp
                    function step5() {
                        let AppDelegateCppFilePath = PATH.join(buildFullDir,
                            "jsb-" + buildData.template + "/frameworks/runtime-src/Classes/AppDelegate.cpp");
                        if (!FS.existsSync(AppDelegateCppFilePath)) {
                            window.plugin._addLog("没有发现文件: " + AppDelegateCppFilePath);
                            doFailed();
                            return;
                        }
                        let data = FS.readFileSync(AppDelegateCppFilePath, 'utf-8');
                        let newData = data;
                        // 添加头文件引入
                        let buglyHeadFlag =
                            "// bugly\n" +
                            "#if (CC_TARGET_PLATFORM == CC_PLATFORM_ANDROID || CC_TARGET_PLATFORM == CC_PLATFORM_IOS)\n" +
                            "#include \"bugly/CrashReport.h\"\n" +
                            "#endif\n" +
                            "USING_NS_CC;";
                        if (data.indexOf(buglyHeadFlag) === -1) {
                            data = data.replace("USING_NS_CC;", buglyHeadFlag);
                            window.plugin._addLog("[AppDelegate.cpp] 添加bugly头文件引用");
                        } else {
                            window.plugin._addLog("[AppDelegate.cpp] 已经添加bugly头文件引用");
                        }
                        // 添加bugly初始化
                        let initFlag =
                            "bool AppDelegate::applicationDidFinishLaunching()\n" +
                            "{\n" +
                            "    // 初始化bugly\n" +
                            "#if (CC_TARGET_PLATFORM == CC_PLATFORM_ANDROID || CC_TARGET_PLATFORM == CC_PLATFORM_IOS)\n" +
                            "     CrashReport::initCrashReport(\"" + window.plugin.gameID + "\", false);\n" +
                            "#endif";

                        if (data.indexOf(initFlag) === -1) {
                            data = data.replace(
                                "bool AppDelegate::applicationDidFinishLaunching()\n" +
                                "{", initFlag);
                            window.plugin._addLog("[AppDelegate.cpp] 添加bugly init code");
                        } else {
                            window.plugin._addLog("[AppDelegate.cpp] 已经添加bugly init code");
                        }

                        // js异常上报
                        let jsReportFlag = "setExceptionCallback([](const char* location, const char* message, const char* stack){\n" +
                            "        // Send exception information to server like Tencent Bugly.\n" +
                            "        #if (CC_TARGET_PLATFORM == CC_PLATFORM_ANDROID || CC_TARGET_PLATFORM == CC_PLATFORM_IOS)\n" +
                            "           CrashReport::reportException(CATEGORY_JS_EXCEPTION,  \"JSException\", message, stack);\n" +
                            "        #endif\n";

                        if (data.indexOf(jsReportFlag) === -1) {
                            data = data.replace("setExceptionCallback([](const char* location, const char* message, const char* stack){\n" +
                                "        // Send exception information to server like Tencent Bugly.\n", jsReportFlag);
                            window.plugin._addLog("[AppDelegate.cpp] 添加bugly ExceptionCallback code");
                        } else {
                            window.plugin._addLog("[AppDelegate.cpp] 已经添加bugly ExceptionCallback code");
                        }


                        FS.writeFileSync(AppDelegateCppFilePath, data);

                        doSuccess();
                    }

                    function doSuccess() {
                        window.plugin._addLog("成功添加bugly,请重新编译项目!");
                    }

                    function doFailed() {
                        window.plugin._addLog("添加bugly失败!");
                    }

                    step1();
                }
            }
        })
    },

    // register your ipc messages here
    messages: {
        'plugin-bugly:cleanLog'(event) {
            window.plugin.logView = [];
        }
    }
});