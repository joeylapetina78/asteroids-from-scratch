// Rules that let the ship interface emerge from installed components. The
// processor asks this file what outputs exist instead of hardcoding them in UI.
const PROCESS_OUTPUT_AMOUNT_LABEL = "material dependent";

export function getProcessorOutputs(components) {
  const outputs = [];

  if (components.engine.installed) {
    outputs.push({
      id: "fuel",
      label: "Fuel",
      amountLabel: PROCESS_OUTPUT_AMOUNT_LABEL,
    });
  }

  if (components.miner.installed) {
    outputs.push({
      id: "ammo",
      label: "Charges",
      amountLabel: PROCESS_OUTPUT_AMOUNT_LABEL,
    });
  }

  if (components.scanner.installed) {
    outputs.push({
      id: "scanergy",
      label: "Scanergy",
      amountLabel: PROCESS_OUTPUT_AMOUNT_LABEL,
    });
  }

  if (components.cargoHold.installed) {
    outputs.push({
      id: "cargo",
      label: "Cargo",
      amountLabel: "store unit",
    });
  }

  return outputs;
}

export function normalizeProcessorOutput(components) {
  const outputs = getProcessorOutputs(components);
  const selectedOutput = outputs.find((output) => output.id === components.processor.output);

  if (selectedOutput || outputs.length === 0) {
    return;
  }

  components.processor.output = outputs[0].id;
}
