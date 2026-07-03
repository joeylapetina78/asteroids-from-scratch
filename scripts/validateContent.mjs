import { chapterOneContracts } from "../src/content/contracts/chapterOneContracts.js?v=contract-deposit-v2";
import { hubServiceDefinitions } from "../src/content/hubs/yardExchangeServices.js?v=world-refs-v1";
import { chapterOneInterviewMission } from "../src/content/missions/chapterOneInterview.js?v=mission-beats-v3";
import { chapterOneNewShipMission } from "../src/content/missions/chapterOneNewShip.js?v=mission-beats-v3";
import { chapterOneRedWorkMission } from "../src/content/missions/chapterOneRedWork.js?v=mission-beats-v3";
import { validateContent } from "../src/systems/contentValidation.js?v=content-validation-v1";

const issues = validateContent({
  missions: [chapterOneInterviewMission, chapterOneNewShipMission, chapterOneRedWorkMission],
  contracts: chapterOneContracts,
  hubServiceDefinitions,
});

if (issues.length > 0) {
  console.error("Content validation failed:");
  issues.forEach((issue) => console.error(`- [${issue.kind}] ${issue.message}`));
  process.exitCode = 1;
} else {
  console.log("Content validation passed.");
}
