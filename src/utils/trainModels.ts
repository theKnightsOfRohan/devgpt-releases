import { supabase } from "@/utils/supabase";
import OpenAI from "openai";

//utils
import getLLMToken from "@/utils/getLLMToken";
import getLofaf from "@/utils/github/getLofaf";
import createTrainingData from "@/utils/createTrainingData";
import createModelID from "./createModelID";

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPEN_AI_KEY,
  organization: getLLMToken(),
  dangerouslyAllowBrowser: true,
});

interface Model {
  id: string;
  created_at: string;
  email: string;
  repo: string;
  owner: string;
  branch: string;
  epochs: number;
  training_method: string;
  frequency: number;
  sample_size: number;
  output?: string;
}

async function trainModels(session: any, user: any) {

  console.log('ran a cycle');
  
  if (!supabase) {
    console.log("No supabase client found");
    return;
  }

  if (!user) {
    console.log("No user found");
    return;
  }

  const { data, error } = await supabase
    .from("models")
    .select("*")
    .eq("email_address", user.email);

  if (!data) return;

  // filter out models that have deleted:true
  const filteredData = data.filter((model: any) => !model.deleted);

  if (error) {
    console.log(error);
    return null;
  }

  const models = filteredData;

  //go through each model and see if it's latest training_log has been fulfilled
  for (const model of models) {
    //get latest training log for this model from supabase training_log table
    const { data: trainingLogData, error: trainingLogError } = await supabase
      .from("training_log")
      .select("*")
      .eq("model_id", createModelID(model.repo, model.owner, model.branch))
      .order("created_at", { ascending: false })
      .limit(1);

    const latest_training_log = trainingLogData?.[0];

    if (!latest_training_log) {
      console.log("No training log found, stopping.");
      return;
    }

    //if the latest training_log has not been fulfilled, train the model
    if (!latest_training_log.fulfilled) {
      switch (model.training_method.toLowerCase()) {
        case "ENCODING":
          return await trainRepoWithEncoding(model, session, user);
          break;
        case "EMBEDDINGS":
          return await trainRepoWithEmbeddings(model, session, user);
          break;
        default:
          return await trainRepoWithEncoding(model, session, user);
          break;
      }
    }
  }
}

export default trainModels;

const trainRepoWithEncoding = async (model: Model, session: any, user: any) => {
  const name = model.repo;
  const owner = model.owner;

  if (!owner || !name || !session.provider_token) return;

  // Get Lofaf
  const lofaf = await getLofaf(owner, name, session);
  const sample_size = model.sample_size;

  // Manipulate lofaf
  let lofafArray = lofaf.tree;
  lofafArray = lofafArray.map((item: any) => {
    return item.path;
  });

  // Join the lofaf together
  const lofafString = lofafArray.join(",");

  // Create training data
  let trainingData = await createTrainingData(
    sample_size,
    lofafString,
    {
      owner: owner,
      repo: name,
    },
    user,
    session
  );

  setModelOutput(model, JSON.stringify(trainingData), user.email);
  return;
};

const trainRepoWithEmbeddings = async (
  model: Model,
  session: any,
  user: any
) => {
  const name = model.repo;
  const owner = model.owner;
  // Get Lofaf
  const lofaf = await getLofaf(owner, name, session);
  const epochs = model.epochs;
  const sample_size = model.sample_size;
  // Manipulate lofaf
  let lofafArray = lofaf.tree;
  lofafArray = lofafArray.map((item: any) => {
    return item.path;
  });
  // Join the lofaf together
  const lofafString = lofafArray.join(",");
  // Create training data
  let trainingData = await createTrainingData(
    sample_size,
    lofafString,
    {
      owner: owner,
      repo: name,
    },
    user,
    session
  );

  // Convert the content to JSONL format
  const jsonlContent = trainingData.map(JSON.stringify).join("\n");
  // Convert to a blob
  const blob = new Blob([jsonlContent], { type: "text/plain" });
  // Convert to a file
  const file = new File([blob], "training.jsonl");
  // Upload the file to openai API
  const uploadedFiles = await openai.files.create({
    file,
    purpose: "fine-tune",
  });
  // Create a fine-tuning job from the uploaded file
  const finetune = await openai.fineTuning.jobs.create({
    training_file: uploadedFiles.id,
    model: `gpt-3.5-turbo`,
    hyperparameters: { n_epochs: epochs },
  });

  setModelOutput(model, finetune.id, user);
};

const setModelOutput = async (model: Model, output: string, user: any) => {
  //replace output for this model in supabase with training data
  if (!supabase) return;

  const { data, error } = await supabase
    .from("models")
    .update({
      output: output,
    })
    .eq("id", model.id)
    .select();

  if (error) {
    console.log('Error:', error);
    return null;
  }

  if (output && !error) {
    //update the training_log table by setting the latest training_log to fulfilled
    const { data: trainingLogData, error: trainingLogError } = await supabase
      .from("training_log")
      .update({ fulfilled: true })
      .eq("model_id", createModelID(model.repo, model.owner, model.branch))
      .order("created_at", { ascending: false })
      .select();

    if (trainingLogError) {
      return null;
    }
  }
};
