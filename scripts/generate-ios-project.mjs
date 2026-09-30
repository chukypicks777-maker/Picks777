import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../ios/', import.meta.url);
const config = JSON.parse(await readFile(new URL('../mobile.config.json', import.meta.url), 'utf8'));
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(config.applicationId) || !/^\d+\.\d+\.\d+$/.test(config.versionName) || !Number.isInteger(config.versionCode)) throw new Error('Configuración de versión inválida.');
const origin = new URL(config.origin);
if (origin.protocol !== 'https:' || origin.origin !== config.origin) throw new Error('Origen iOS inválido.');
const id = n => String(n).padStart(24, '0');
const project = new URL('Picks777.xcodeproj/', root);
const common = `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = ${config.versionCode}; GENERATE_INFOPLIST_FILE = NO; INFOPLIST_FILE = Picks777/Info.plist; IPHONEOS_DEPLOYMENT_TARGET = 17.0; MARKETING_VERSION = ${config.versionName}; PRODUCT_BUNDLE_IDENTIFIER = ${config.applicationId}; PRODUCT_NAME = "$(TARGET_NAME)"; SDKROOT = iphoneos; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; SUPPORTS_MACCATALYST = NO; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = 1;`;
const objects = [
  `${id(1)} = {isa = PBXProject; attributes = {LastUpgradeCheck = 1600;}; buildConfigurationList = ${id(15)}; compatibilityVersion = "Xcode 14.0"; developmentRegion = es; hasScannedForEncodings = 0; knownRegions = (es, en, Base); mainGroup = ${id(2)}; productRefGroup = ${id(4)}; projectDirPath = ""; projectRoot = ""; targets = (${id(5)});};`,
  `${id(2)} = {isa = PBXGroup; children = (${id(3)}, ${id(4)}); sourceTree = "<group>";};`,
  `${id(3)} = {isa = PBXGroup; path = Picks777; sourceTree = "<group>"; children = (${id(6)}, ${id(7)}, ${id(8)}, ${id(9)}, ${id(10)});};`,
  `${id(4)} = {isa = PBXGroup; name = Products; sourceTree = "<group>"; children = (${id(11)});};`,
  `${id(5)} = {isa = PBXNativeTarget; buildConfigurationList = ${id(16)}; buildPhases = (${id(12)}, ${id(13)}, ${id(14)}); buildRules = (); dependencies = (); name = Picks777; productName = Picks777; productReference = ${id(11)}; productType = "com.apple.product-type.application";};`,
  ...[['Picks777App.swift','sourcecode.swift'],['PicksBrowser.swift','sourcecode.swift'],['Info.plist','text.plist.xml'],['PrivacyInfo.xcprivacy','text.xml'],['Assets.xcassets','folder.assetcatalog']].map(([path,type],i) => `${id(i+6)} = {isa = PBXFileReference; lastKnownFileType = ${type}; path = ${path}; sourceTree = "<group>";};`),
  `${id(11)} = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Picks777.app; sourceTree = BUILT_PRODUCTS_DIR;};`,
  `${id(12)} = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (${id(21)}, ${id(22)}); runOnlyForDeploymentPostprocessing = 0;};`,
  `${id(13)} = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;};`,
  `${id(14)} = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (${id(23)}, ${id(24)}); runOnlyForDeploymentPostprocessing = 0;};`,
  `${id(15)} = {isa = XCConfigurationList; buildConfigurations = (${id(17)}, ${id(18)}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;};`,
  `${id(16)} = {isa = XCConfigurationList; buildConfigurations = (${id(19)}, ${id(20)}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;};`,
  `${id(17)} = {isa = XCBuildConfiguration; buildSettings = {CLANG_ENABLE_MODULES = YES; SWIFT_OPTIMIZATION_LEVEL = "-Onone";}; name = Debug;};`,
  `${id(18)} = {isa = XCBuildConfiguration; buildSettings = {CLANG_ENABLE_MODULES = YES; SWIFT_COMPILATION_MODE = wholemodule; SWIFT_OPTIMIZATION_LEVEL = "-O";}; name = Release;};`,
  `${id(19)} = {isa = XCBuildConfiguration; buildSettings = {${common} SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;}; name = Debug;};`,
  `${id(20)} = {isa = XCBuildConfiguration; buildSettings = {${common}}; name = Release;};`,
  ...[6,7,9,10].map((ref,i) => `${id(i+21)} = {isa = PBXBuildFile; fileRef = ${id(ref)};};`)
];
await mkdir(new URL('xcshareddata/xcschemes/', project), { recursive: true });
await writeFile(new URL('project.pbxproj', project), `// !$*UTF8*$!\n{archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n${objects.join('\n')}\n}; rootObject = ${id(1)};}\n`);
await writeFile(new URL('xcshareddata/xcschemes/Picks777.xcscheme', project), `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${id(5)}" BuildableName="Picks777.app" BlueprintName="Picks777" ReferencedContainer="container:Picks777.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${id(5)}" BuildableName="Picks777.app" BlueprintName="Picks777" ReferencedContainer="container:Picks777.xcodeproj"/></BuildableProductRunnable></LaunchAction><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>\n`);
const plist = await readFile(new URL('Picks777/Info.plist', root), 'utf8');
await writeFile(new URL('Picks777/Info.plist', root), plist.replace(/(<key>PicksOrigin<\/key><string>)[^<]+/, '$1' + config.origin));
console.log(`Proyecto Xcode preparado: ios/Picks777.xcodeproj (${config.versionName}, build ${config.versionCode}). Compilación y firma pendientes de Xcode en Mac.`);
