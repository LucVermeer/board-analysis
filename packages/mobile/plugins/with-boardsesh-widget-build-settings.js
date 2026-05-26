const { createRunOncePlugin } = require('expo/config-plugins');
const { withXcodeProjectBeta } = require('@bacons/apple-targets/build/with-bacons-xcode');

const WIDGET_TARGET_NAME = 'BoardseshWidgets';
const WIDGET_SWIFT_FLAGS = '$(inherited) -D WIDGET_EXTENSION';
const WIDGET_DEPLOYMENT_TARGET = '17.0';

function getProjectTargets(project) {
  return project?.rootObject?.props?.targets ?? [];
}

function isNativeTarget(candidateTarget) {
  return candidateTarget?.isa === 'PBXNativeTarget';
}

function isBoardseshWidgetsTarget(candidateTarget) {
  return (
    candidateTarget?.props?.name === WIDGET_TARGET_NAME || candidateTarget?.props?.productName === WIDGET_TARGET_NAME
  );
}

function configureBoardseshWidgetTarget(project) {
  const boardseshWidgetsTarget = getProjectTargets(project).find(
    (candidateTarget) => isNativeTarget(candidateTarget) && isBoardseshWidgetsTarget(candidateTarget),
  );

  if (!boardseshWidgetsTarget) {
    throw new Error(`Could not find ${WIDGET_TARGET_NAME} in the generated Xcode project.`);
  }

  if (typeof boardseshWidgetsTarget.setBuildSetting !== 'function') {
    throw new Error(`${WIDGET_TARGET_NAME} target does not support setBuildSetting().`);
  }

  boardseshWidgetsTarget.setBuildSetting('OTHER_SWIFT_FLAGS', WIDGET_SWIFT_FLAGS);
  boardseshWidgetsTarget.setBuildSetting('IPHONEOS_DEPLOYMENT_TARGET', WIDGET_DEPLOYMENT_TARGET);
}

function withBoardseshWidgetBuildSettings(config) {
  return withXcodeProjectBeta(config, async (modConfig) => {
    configureBoardseshWidgetTarget(modConfig.modResults);
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withBoardseshWidgetBuildSettings, 'with-boardsesh-widget-build-settings', '1.0.0');
module.exports.configureBoardseshWidgetTarget = configureBoardseshWidgetTarget;
module.exports.WIDGET_DEPLOYMENT_TARGET = WIDGET_DEPLOYMENT_TARGET;
module.exports.WIDGET_SWIFT_FLAGS = WIDGET_SWIFT_FLAGS;
