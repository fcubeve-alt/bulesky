// Add PrivacyInfo.xcprivacy to the Xcode project, so it is actually bundled.
//
// Writing the file next to Info.plist is not enough: Xcode only copies what the
// project lists as a resource, and a manifest sitting in the folder unreferenced
// builds fine, uploads fine, and is rejected by App Store Connect for a missing
// privacy manifest. That is a slow, confusing failure a long way from its cause,
// so it is done here rather than left as a step somebody remembers.
//
// project.pbxproj is a three-part edit for one file:
//   PBXFileReference     the file exists
//   PBXBuildFile         it takes part in a build phase
//   PBXResourcesBuildPhase   …that phase being "copy into the bundle"
//
// Idempotent: running it twice changes nothing. The ids below are fixed rather
// than random so a second run cannot add a duplicate entry with a new id, which
// is a corruption Xcode will not warn about.
//
//   node tools/patch-ios-project.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PROJ = 'app/ios/App/App.xcodeproj/project.pbxproj';
const FILE_REF = 'AAAA0001BULESKYPRIVACY01';
const BUILD_FILE = 'AAAA0002BULESKYPRIVACY02';
const NAME = 'PrivacyInfo.xcprivacy';

if (!existsSync(PROJ)) {
  console.log(`skipped — no Xcode project yet (cd app && npx cap add ios)`);
  process.exit(0);
}

let s = readFileSync(PROJ, 'utf8');
if (s.includes(NAME)) {
  console.log(`already referenced — nothing to do`);
  process.exit(0);
}

const before = s.length;

// 1. The file exists. Anchored on Info.plist's reference, which is in the same
//    group and the same folder.
s = s.replace(
  /(\t\t504EC3131FED79650016851F \/\* Info\.plist \*\/ = \{isa = PBXFileReference;[^\n]*\n)/,
  `$1\t\t${FILE_REF} /* ${NAME} */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = ${NAME}; sourceTree = "<group>"; };\n`
);

// 2. It takes part in a build.
s = s.replace(
  /(\t\t504EC30F1FED79650016851F \/\* Assets\.xcassets in Resources \*\/ = \{isa = PBXBuildFile;[^\n]*\n)/,
  `$1\t\t${BUILD_FILE} /* ${NAME} in Resources */ = {isa = PBXBuildFile; fileRef = ${FILE_REF} /* ${NAME} */; };\n`
);

// 3. Shown in the project navigator, next to Info.plist.
s = s.replace(
  /(\t\t\t\t504EC3131FED79650016851F \/\* Info\.plist \*\/,\n)/,
  `$1\t\t\t\t${FILE_REF} /* ${NAME} */,\n`
);

// 4. Copied into the bundle.
s = s.replace(
  /(\t\t\t\t504EC30F1FED79650016851F \/\* Assets\.xcassets in Resources \*\/,\n)/,
  `$1\t\t\t\t${BUILD_FILE} /* ${NAME} in Resources */,\n`
);

const added = [
  [`PBXFileReference`, s.includes(`${FILE_REF} /* ${NAME} */ = {isa = PBXFileReference`)],
  [`PBXBuildFile`, s.includes(`${BUILD_FILE} /* ${NAME} in Resources */ = {isa = PBXBuildFile`)],
  [`group`, s.includes(`\t\t\t\t${FILE_REF} /* ${NAME} */,`)],
  [`Resources phase`, s.includes(`\t\t\t\t${BUILD_FILE} /* ${NAME} in Resources */,`)],
];

const missing = added.filter(([, ok]) => !ok).map(([k]) => k);
if (missing.length) {
  console.error(`FAILED — could not add: ${missing.join(', ')}`);
  console.error('The project template changed. Add PrivacyInfo.xcprivacy in Xcode by hand:');
  console.error('  drag it into the App group, tick "App" under Target Membership.');
  process.exit(1);
}

writeFileSync(PROJ, s);
console.log(`patched ${PROJ} (+${s.length - before} bytes)`);
for (const [k] of added) console.log(`  ✓ ${k}`);
