import { gql } from 'graphql-request';
import type { SubmitAppFeedbackInput } from '@boardsesh/shared-schema';

export const SUBMIT_APP_FEEDBACK = gql`
  mutation SubmitAppFeedback($input: SubmitAppFeedbackInput!) {
    submitAppFeedback(input: $input)
  }
`;

export type SubmitAppFeedbackMutationVariables = {
  input: SubmitAppFeedbackInput;
};

export type SubmitAppFeedbackMutationResponse = {
  submitAppFeedback: boolean;
};
