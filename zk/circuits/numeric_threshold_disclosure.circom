pragma circom 2.1.6;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

template NumericThresholdDisclosure() {
    signal input fieldTag;
    signal input value;
    signal input salt;

    signal input commitment;
    signal input minValue;

    component commitmentHash = Poseidon(3);
    commitmentHash.inputs[0] <== fieldTag;
    commitmentHash.inputs[1] <== value;
    commitmentHash.inputs[2] <== salt;

    commitmentHash.out === commitment;

    component thresholdCheck = GreaterEqThan(64);
    thresholdCheck.in[0] <== value;
    thresholdCheck.in[1] <== minValue;
    thresholdCheck.out === 1;
}

component main { public [commitment, minValue] } = NumericThresholdDisclosure();
