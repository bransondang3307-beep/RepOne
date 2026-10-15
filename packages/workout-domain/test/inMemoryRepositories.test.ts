import { createInMemoryRepositories } from '../src';
import { describeRepositoriesContract } from '../src/testing';

describeRepositoriesContract('in-memory', async () => createInMemoryRepositories());
