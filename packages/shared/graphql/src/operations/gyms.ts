import { gql } from 'graphql-request';
import type {
  Gym,
  GymConnection,
  GymMemberConnection,
  CreateGymInput,
  UpdateGymInput,
  AddGymMemberInput,
  RemoveGymMemberInput,
  FollowGymInput,
  MyGymsInput,
  SearchGymsInput,
  GymMembersInput,
  LinkBoardToGymInput,
} from '@boardsesh/shared-schema';

// ============================================
// Gym Queries
// ============================================

const GYM_FIELDS = `
  uuid
  slug
  ownerId
  ownerDisplayName
  ownerAvatarUrl
  name
  description
  address
  contactEmail
  contactPhone
  latitude
  longitude
  isPublic
  imageUrl
  createdAt
  boardCount
  memberCount
  followerCount
  commentCount
  isFollowedByMe
  isMember
  myRole
`;

export const GET_GYM = gql`
  query GetGym($gymUuid: ID!) {
    gym(gymUuid: $gymUuid) {
      ${GYM_FIELDS}
    }
  }
`;

export const GET_GYM_BY_SLUG = gql`
  query GetGymBySlug($slug: String!) {
    gymBySlug(slug: $slug) {
      ${GYM_FIELDS}
    }
  }
`;

export const GET_MY_GYMS = gql`
  query GetMyGyms($input: MyGymsInput) {
    myGyms(input: $input) {
      gyms {
        ${GYM_FIELDS}
      }
      totalCount
      hasMore
    }
  }
`;

export const SEARCH_GYMS = gql`
  query SearchGyms($input: SearchGymsInput!) {
    searchGyms(input: $input) {
      gyms {
        ${GYM_FIELDS}
      }
      totalCount
      hasMore
    }
  }
`;

export const GET_GYM_MEMBERS = gql`
  query GetGymMembers($input: GymMembersInput!) {
    gymMembers(input: $input) {
      members {
        userId
        displayName
        avatarUrl
        role
        createdAt
      }
      totalCount
      hasMore
    }
  }
`;

// ============================================
// Gym Mutations
// ============================================

export const CREATE_GYM = gql`
  mutation CreateGym($input: CreateGymInput!) {
    createGym(input: $input) {
      ${GYM_FIELDS}
    }
  }
`;

export const UPDATE_GYM = gql`
  mutation UpdateGym($input: UpdateGymInput!) {
    updateGym(input: $input) {
      ${GYM_FIELDS}
    }
  }
`;

export const DELETE_GYM = gql`
  mutation DeleteGym($gymUuid: ID!) {
    deleteGym(gymUuid: $gymUuid)
  }
`;

export const ADD_GYM_MEMBER = gql`
  mutation AddGymMember($input: AddGymMemberInput!) {
    addGymMember(input: $input)
  }
`;

export const REMOVE_GYM_MEMBER = gql`
  mutation RemoveGymMember($input: RemoveGymMemberInput!) {
    removeGymMember(input: $input)
  }
`;

export const FOLLOW_GYM = gql`
  mutation FollowGym($input: FollowGymInput!) {
    followGym(input: $input)
  }
`;

export const UNFOLLOW_GYM = gql`
  mutation UnfollowGym($input: FollowGymInput!) {
    unfollowGym(input: $input)
  }
`;

export const LINK_BOARD_TO_GYM = gql`
  mutation LinkBoardToGym($input: LinkBoardToGymInput!) {
    linkBoardToGym(input: $input)
  }
`;

// ============================================
// Query/Mutation Variable Types
// ============================================

export type GetGymQueryVariables = {
  gymUuid: string;
};

export type GetGymQueryResponse = {
  gym: Gym | null;
};

export type GetGymBySlugQueryVariables = {
  slug: string;
};

export type GetGymBySlugQueryResponse = {
  gymBySlug: Gym | null;
};

export type GetMyGymsQueryVariables = {
  input?: MyGymsInput;
};

export type GetMyGymsQueryResponse = {
  myGyms: GymConnection;
};

export type SearchGymsQueryVariables = {
  input: SearchGymsInput;
};

export type SearchGymsQueryResponse = {
  searchGyms: GymConnection;
};

export type GetGymMembersQueryVariables = {
  input: GymMembersInput;
};

export type GetGymMembersQueryResponse = {
  gymMembers: GymMemberConnection;
};

export type CreateGymMutationVariables = {
  input: CreateGymInput;
};

export type CreateGymMutationResponse = {
  createGym: Gym;
};

export type UpdateGymMutationVariables = {
  input: UpdateGymInput;
};

export type UpdateGymMutationResponse = {
  updateGym: Gym;
};

export type DeleteGymMutationVariables = {
  gymUuid: string;
};

export type DeleteGymMutationResponse = {
  deleteGym: boolean;
};

export type AddGymMemberMutationVariables = {
  input: AddGymMemberInput;
};

export type AddGymMemberMutationResponse = {
  addGymMember: boolean;
};

export type RemoveGymMemberMutationVariables = {
  input: RemoveGymMemberInput;
};

export type RemoveGymMemberMutationResponse = {
  removeGymMember: boolean;
};

export type FollowGymMutationVariables = {
  input: FollowGymInput;
};

export type FollowGymMutationResponse = {
  followGym: boolean;
};

export type UnfollowGymMutationVariables = {
  input: FollowGymInput;
};

export type UnfollowGymMutationResponse = {
  unfollowGym: boolean;
};

export type LinkBoardToGymMutationVariables = {
  input: LinkBoardToGymInput;
};

export type LinkBoardToGymMutationResponse = {
  linkBoardToGym: boolean;
};
