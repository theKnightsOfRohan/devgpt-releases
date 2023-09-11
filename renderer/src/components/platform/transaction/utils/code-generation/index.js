//code gen routes
import detectPromptIntent from "./detectPromptIntent";
import generateAdvice from "./generateAdvice";
import generateCode from "./generateCode";
import generateNewGenerationCode from "./generateNewGenerationCode";
import generateQuestions from "./generateQuestions";
import getLofaf from "./getLofaf";
import saveTaskInDatabase from "./saveTaskInDatabase";
import syncCodeChangesWithLocalFileSystem from "./syncCodeChangesWithLocalFileSystem";

export {
  getLofaf,
  generateQuestions,
  generateCode,
  generateNewGenerationCode,
  syncCodeChangesWithLocalFileSystem,
  saveTaskInDatabase,
  generateAdvice,
  detectPromptIntent,
};
