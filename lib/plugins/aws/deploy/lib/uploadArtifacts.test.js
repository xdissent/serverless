'use strict';

const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const normalizeFiles = require('../../lib/normalizeFiles');
const expect = require('chai').expect;
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const testUtils = require('../../../../../tests/utils');

describe('uploadArtifacts', () => {
  let serverless;
  let awsDeploy;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.config.servicePath = 'foo';
    serverless.setProvider('aws', new AwsProvider(serverless));
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.bucketName = 'deployment-bucket';
    awsDeploy.serverless.service.package.artifactDirectoryName = 'somedir';
    awsDeploy.serverless.service.functions = {
      first: {
        handler: 'foo',
      },
    };

    awsDeploy.serverless.cli = new serverless.classes.CLI();
  });

  describe('#uploadCloudFormationFile()', () => {
    let normalizeCloudFormationTemplateStub;
    let putObjectStub;

    beforeEach(() => {
      normalizeCloudFormationTemplateStub = sinon
        .stub(normalizeFiles, 'normalizeCloudFormationTemplate')
        .returns({ foo: 'bar' });
      putObjectStub = sinon
        .stub(awsDeploy.provider, 'request').resolves();
    });

    afterEach(() => {
      normalizeFiles.normalizeCloudFormationTemplate.restore();
      awsDeploy.provider.request.restore();
    });

    it('should upload the CloudFormation file to the S3 bucket', () => {
      // eji/gfOD9pQzrW6QDTWz4jhVk/dqe3q11DVbi6Qe4ks= <-- hash of the local CloudFormation file
      awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = { foo: 'bar' };

      return awsDeploy.uploadCloudFormationFile().then(() => {
        expect(normalizeCloudFormationTemplateStub.calledOnce).to.equal(true);
        expect(putObjectStub.calledOnce).to.equal(true);
        expect(normalizeCloudFormationTemplateStub.calledWithExactly({ foo: 'bar' }))
          .to.equal(true);
        expect(putObjectStub.calledWithExactly(
          'S3',
          'putObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package
              .artifactDirectoryName}/compiled-cloudformation-template.json`,
            Body: JSON.stringify({ foo: 'bar' }),
            ContentType: 'application/json',
            Metadata: {
              filesha256: 'eji/gfOD9pQzrW6QDTWz4jhVk/dqe3q11DVbi6Qe4ks=',
            },
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
      });
    });

    it('should upload to a bucket with server side encryption bucket policy', () => {
      // eji/gfOD9pQzrW6QDTWz4jhVk/dqe3q11DVbi6Qe4ks= <-- hash of the local CloudFormation file
      awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = { foo: 'bar' };
      awsDeploy.serverless.service.provider.deploymentBucketObject = {
        serverSideEncryption: 'AES256',
      };

      return awsDeploy.uploadCloudFormationFile().then(() => {
        expect(normalizeCloudFormationTemplateStub.calledOnce).to.equal(true);
        expect(putObjectStub.calledOnce).to.be.equal(true);
        expect(putObjectStub.calledWithExactly(
          'S3',
          'putObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package
              .artifactDirectoryName}/compiled-cloudformation-template.json`,
            Body: JSON.stringify({ foo: 'bar' }),
            ContentType: 'application/json',
            ServerSideEncryption: 'AES256',
            Metadata: {
              filesha256: 'eji/gfOD9pQzrW6QDTWz4jhVk/dqe3q11DVbi6Qe4ks=',
            },
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
      });
    });
  });

  describe('#uploadZipFile()', () => {
    let readFileSyncStub;
    let putObjectStub;

    beforeEach(() => {
      readFileSyncStub = sinon
        .stub(fs, 'readFileSync');
      putObjectStub = sinon
        .stub(awsDeploy.provider, 'request').resolves();
    });

    afterEach(() => {
      fs.readFileSync.restore();
      awsDeploy.provider.request.restore();
    });

    it('should throw for null artifact paths', () => {
      expect(() => awsDeploy.uploadZipFile(null)).to.throw(Error);
    });

    it('should upload the .zip file to the S3 bucket', () => {
      // awnY7Oi280gp5kTCloXzsqJCO4J766x6hATWqQsN/uM= <-- hash of the local zip file
      readFileSyncStub.returns(new Buffer('my-service.zip content'));

      const tmpDirPath = testUtils.getTmpDirPath();
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');

      return awsDeploy.uploadZipFile(artifactFilePath).then(() => {
        expect(putObjectStub.calledOnce).to.be.equal(true);
        expect(putObjectStub.calledWithExactly(
          'S3',
          'putObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package.artifactDirectoryName}/artifact.zip`,
            Body: sinon.match.object.and(sinon.match.has('path', artifactFilePath)),
            ContentType: 'application/zip',
            Metadata: {
              filesha256: 'awnY7Oi280gp5kTCloXzsqJCO4J766x6hATWqQsN/uM=',
            },
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
      });
    });

    it('should upload to a bucket with server side encryption bucket policy', () => {
      // awnY7Oi280gp5kTCloXzsqJCO4J766x6hATWqQsN/uM= <-- hash of the local zip file
      readFileSyncStub.returns(new Buffer('my-service.zip content'));

      const tmpDirPath = testUtils.getTmpDirPath();
      const artifactFilePath = path.join(tmpDirPath, 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');
      awsDeploy.serverless.service.provider.deploymentBucketObject = {
        serverSideEncryption: 'AES256',
      };

      return awsDeploy.uploadZipFile(artifactFilePath).then(() => {
        expect(putObjectStub.calledOnce).to.be.equal(true);
        expect(putObjectStub.calledWithExactly(
          'S3',
          'putObject',
          {
            Bucket: awsDeploy.bucketName,
            Key: `${awsDeploy.serverless.service.package.artifactDirectoryName}/artifact.zip`,
            Body: sinon.match.object.and(sinon.match.has('path', artifactFilePath)),
            ContentType: 'application/zip',
            ServerSideEncryption: 'AES256',
            Metadata: {
              filesha256: 'awnY7Oi280gp5kTCloXzsqJCO4J766x6hATWqQsN/uM=',
            },
          },
          awsDeploy.options.stage,
          awsDeploy.options.region
        )).to.be.equal(true);
      });
    });
  });

  describe('#uploadFunctions()', () => {
    it('should upload the service artifact file to the S3 bucket', () => {
      awsDeploy.serverless.config.servicePath = 'some/path';
      awsDeploy.serverless.service.service = 'new-service';

      sinon.stub(fs, 'statSync').returns({ size: 0 });

      const uploadZipFileStub = sinon
        .stub(awsDeploy, 'uploadZipFile').resolves();

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledOnce).to.be.equal(true);
        fs.statSync.restore();
        awsDeploy.uploadZipFile.restore();
      });
    });

    it('should upload the function .zip files to the S3 bucket', () => {
      awsDeploy.serverless.service.package.individually = true;
      awsDeploy.serverless.service.functions = {
        first: {
          package: {
            artifact: 'first-artifact.zip',
          },
        },
        second: {
          package: {
            artifact: 'second-artifact.zip',
          },
        },
      };

      const uploadZipFileStub = sinon
        .stub(awsDeploy, 'uploadZipFile').resolves();

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledTwice).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0])
          .to.be.equal(awsDeploy.serverless.service.functions.first.package.artifact);
        expect(uploadZipFileStub.args[1][0])
          .to.be.equal(awsDeploy.serverless.service.functions.second.package.artifact);
        awsDeploy.uploadZipFile.restore();
      });
    });

    it('should upload single function artifact and service artifact', () => {
      awsDeploy.serverless.service.package.artifact = 'second-artifact.zip';
      awsDeploy.serverless.service.functions = {
        first: {
          handler: 'bar',
          package: {
            artifact: 'first-artifact.zip',
            individually: true,
          },
        },
        second: {
          handler: 'foo',
        },
      };

      const uploadZipFileStub = sinon
        .stub(awsDeploy, 'uploadZipFile').resolves();
      sinon.stub(fs, 'statSync').returns({ size: 1024 });

      return awsDeploy.uploadFunctions().then(() => {
        expect(uploadZipFileStub.calledTwice).to.be.equal(true);
        expect(uploadZipFileStub.args[0][0])
          .to.be.equal(awsDeploy.serverless.service.functions.first.package.artifact);
        expect(uploadZipFileStub.args[1][0])
          .to.be.equal(awsDeploy.serverless.service.package.artifact);
        awsDeploy.uploadZipFile.restore();
        fs.statSync.restore();
      });
    });

    it('should log artifact size', () => {
      awsDeploy.serverless.config.servicePath = 'some/path';
      awsDeploy.serverless.service.service = 'new-service';

      sinon.stub(fs, 'statSync').returns({ size: 1024 });
      sinon.stub(awsDeploy, 'uploadZipFile').resolves();
      sinon.spy(awsDeploy.serverless.cli, 'log');

      return awsDeploy.uploadFunctions().then(() => {
        const expected = 'Uploading service .zip file to S3 (1 KB)...';
        expect(awsDeploy.serverless.cli.log.calledWithExactly(expected)).to.be.equal(true);

        fs.statSync.restore();
        awsDeploy.uploadZipFile.restore();
      });
    });
  });

  describe('#uploadArtifacts()', () => {
    it('should run promise chain in order', () => {
      const uploadCloudFormationFileStub = sinon
        .stub(awsDeploy, 'uploadCloudFormationFile').resolves();
      const uploadFunctionsStub = sinon
        .stub(awsDeploy, 'uploadFunctions').resolves();

      return awsDeploy.uploadArtifacts().then(() => {
        expect(uploadCloudFormationFileStub.calledOnce)
          .to.be.equal(true);
        expect(uploadFunctionsStub.calledAfter(uploadCloudFormationFileStub)).to.be.equal(true);

        awsDeploy.uploadCloudFormationFile.restore();
        awsDeploy.uploadFunctions.restore();
      });
    });
  });
});
