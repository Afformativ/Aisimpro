pragma circom 2.1.6;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

template OreSelectiveDisclosure(setSize) {
    signal input countryCode;
    signal input gradeValue;
    signal input salt;

    signal input commitment;
    signal input minGrade;
    signal input allowedCountries[setSize];

    component commitmentHash = Poseidon(3);
    commitmentHash.inputs[0] <== countryCode;
    commitmentHash.inputs[1] <== gradeValue;
    commitmentHash.inputs[2] <== salt;

    commitmentHash.out === commitment;

    component gradeCheck = GreaterEqThan(64);
    gradeCheck.in[0] <== gradeValue;
    gradeCheck.in[1] <== minGrade;
    gradeCheck.out === 1;

    signal membership[setSize];
    component eq[setSize];

    for (var i = 0; i < setSize; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== countryCode;
        eq[i].in[1] <== allowedCountries[i];
        membership[i] <== eq[i].out;
    }

    var membershipSum = 0;
    for (var j = 0; j < setSize; j++) {
        membershipSum += membership[j];
    }
    membershipSum === 1;
}

component main { public [commitment, minGrade, allowedCountries] } = OreSelectiveDisclosure(3);
